/**
 * Environment Variables Validator
 *
 * Validates required and optional environment variables on application startup
 * Fails fast if critical configuration is missing
 */

export interface EnvValidationError {
  variable: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface EnvValidationResult {
  valid: boolean;
  errors: EnvValidationError[];
  warnings: EnvValidationError[];
}

/**
 * Environment variable definitions
 */
interface EnvVarDefinition {
  name: string;
  required: boolean;
  requiredInProduction?: boolean; // Only required in production
  default?: string;
  validator?: (value: string) => boolean;
  description: string;
  example?: string;
}

const ENV_VARS: EnvVarDefinition[] = [
  // Server Configuration
  {
    name: 'PORT',
    required: false,
    default: '4001',
    validator: (val) => !isNaN(Number(val)) && Number(val) > 0 && Number(val) < 65536,
    description: 'Server port number (1-65535)',
    example: '4001',
  },
  {
    name: 'NODE_ENV',
    required: false,
    default: 'development',
    validator: (val) => ['development', 'production', 'test'].includes(val),
    description: 'Node environment (development, production, test)',
    example: 'production',
  },

  // Storage Configuration
  {
    name: 'STORAGE_MODE',
    required: true,
    validator: (val) => val === 'local',
    description: 'Storage backend mode (local only)',
    example: 'local',
  },
  {
    name: 'RAW_STORAGE_MODE',
    required: false,
    default: 'local_only',
    validator: (val) => val === 'local_only',
    description: 'Raw content storage policy mode (must be local_only)',
    example: 'local_only',
  },
  {
    name: 'LOCAL_DOCS_PATH',
    required: true,
    description: 'Path to local document storage',
    example: '~/.keimenon',
  },
  {
    name: 'SQLITE_PATH',
    required: true,
    description: 'Path to SQLite database file',
    example: '~/.keimenon/keimenon.db',
  },
  {
    name: 'STORAGE_PATH',
    required: false,
    default: './storage',
    description: 'Path for file uploads',
    example: './storage',
  },
  {
    name: 'MAX_FILE_SIZE_MB',
    required: false,
    default: '10',
    validator: (val) => !isNaN(Number(val)) && Number(val) > 0,
    description: 'Maximum file upload size in MB',
    example: '10',
  },
  {
    name: 'KILL_SWITCH_OBJECTIVE_ENQUEUE',
    required: false,
    default: '0',
    validator: (val) =>
      ['0', '1', 'true', 'false', 'on', 'off', 'yes', 'no'].includes(val.toLowerCase()),
    description: 'Gate-E rollback switch for objective enqueue stage',
    example: '0',
  },
  {
    name: 'KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE',
    required: false,
    default: '0',
    validator: (val) =>
      ['0', '1', 'true', 'false', 'on', 'off', 'yes', 'no'].includes(val.toLowerCase()),
    description: 'Gate-E rollback switch for SimilarityEngineV2 semantic stage',
    example: '0',
  },

  // Security
  {
    name: 'JWT_SECRET',
    required: true,
    requiredInProduction: true,
    validator: (val) => {
      if (process.env.NODE_ENV === 'production') {
        // In production, ensure it's changed from default and is strong
        return val !== 'your_secret_key_here_CHANGE_IN_PRODUCTION' && val.length >= 32;
      }
      return val.length >= 8; // Development can be more lenient
    },
    description: 'JWT signing secret (min 32 chars in production)',
    example: 'your-generated-secret-here',
  },
  {
    name: 'ALLOWED_ORIGINS',
    required: false,
    requiredInProduction: true,
    validator: (val) => {
      if (!val) return true; // Optional in development
      // Check if it's a comma-separated list of URLs
      const origins = val.split(',');
      return origins.every((origin) => {
        try {
          new URL(origin.trim());
          return true;
        } catch {
          return false;
        }
      });
    },
    description: 'Comma-separated list of allowed CORS origins (required in production)',
    example: 'https://yourdomain.com,https://app.yourdomain.com',
  },

  // Tier Limits (Optional)
  {
    name: 'FREE_MAX_SOURCES',
    required: false,
    default: '500',
    validator: (val) => !isNaN(Number(val)) && Number(val) > 0,
    description: 'Free tier max sources',
    example: '500',
  },
  {
    name: 'FREE_MAX_NODES',
    required: false,
    default: '20000',
    validator: (val) => !isNaN(Number(val)) && Number(val) > 0,
    description: 'Free tier max nodes',
    example: '20000',
  },
  {
    name: 'FREE_MAX_GROUPS',
    required: false,
    default: '50',
    validator: (val) => !isNaN(Number(val)) && Number(val) > 0,
    description: 'Free tier max groups',
    example: '50',
  },
  {
    name: 'FREE_STORAGE_GB',
    required: false,
    default: '5',
    validator: (val) => !isNaN(Number(val)) && Number(val) > 0,
    description: 'Free tier storage limit in GB',
    example: '5',
  },
];

/**
 * Validate all environment variables
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: EnvValidationError[] = [];
  const warnings: EnvValidationError[] = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const storageMode = process.env.STORAGE_MODE || 'local';

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    // Check if required
    const isRequired = envVar.required || (envVar.requiredInProduction && isProduction);

    if (isRequired && !value) {
      errors.push({
        variable: envVar.name,
        message: `${envVar.name} is required but not set. ${envVar.description}${envVar.example ? ` Example: ${envVar.example}` : ''}`,
        severity: 'error',
      });
      continue;
    }

    // Local-only contract: reject unsupported storage modes explicitly.
    if (envVar.name === 'STORAGE_MODE' && value && value !== 'local') {
      errors.push({
        variable: envVar.name,
        message: `STORAGE_MODE='${value}' is not supported. Only 'local' is allowed.`,
        severity: 'error',
      });
      continue;
    }

    if (envVar.name === 'RAW_STORAGE_MODE' && value && value !== 'local_only') {
      errors.push({
        variable: envVar.name,
        message: `RAW_STORAGE_MODE='${value}' is not supported. Only 'local_only' is allowed.`,
        severity: 'error',
      });
      continue;
    }

    // If value exists, validate it
    if (value && envVar.validator) {
      if (!envVar.validator(value)) {
        errors.push({
          variable: envVar.name,
          message: `${envVar.name}='${value}' is invalid. ${envVar.description}${envVar.example ? ` Example: ${envVar.example}` : ''}`,
          severity: 'error',
        });
      }
    }

    // Warning for default/example values in production
    if (isProduction && value) {
      if (envVar.name === 'JWT_SECRET' && value === 'your_secret_key_here_CHANGE_IN_PRODUCTION') {
        errors.push({
          variable: envVar.name,
          message:
            'JWT_SECRET is set to default value in production! This is a critical security risk. Generate a strong secret immediately.',
          severity: 'error',
        });
      }
    }
  }

  // Additional production warnings
  if (isProduction) {
    // Warn if ALLOWED_ORIGINS not set in production
    if (!process.env.ALLOWED_ORIGINS) {
      warnings.push({
        variable: 'ALLOWED_ORIGINS',
        message: 'ALLOWED_ORIGINS not set in production. CORS will be very restrictive.',
        severity: 'warning',
      });
    }

    // Warn if using default JWT secret in production
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.includes('your_secret_key_here')) {
      errors.push({
        variable: 'JWT_SECRET',
        message:
          'JWT_SECRET appears to be the default value in production! This is a critical security vulnerability.',
        severity: 'error',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment and print results
 * Returns true if valid, false otherwise
 */
export function validateAndPrintEnvironment(): boolean {
  const result = validateEnvironment();

  console.log('\n==============================================');
  console.log('🔍 Environment Variables Validation');
  console.log('==============================================\n');

  // Print errors
  if (result.errors.length > 0) {
    console.log('❌ ERRORS:');
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.variable}: ${error.message}`);
    });
    console.log('');
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    result.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning.variable}: ${warning.message}`);
    });
    console.log('');
  }

  // Print summary
  if (result.valid) {
    console.log('✅ All required environment variables are set and valid!');
  } else {
    console.log(`❌ Validation failed with ${result.errors.length} error(s).`);
    console.log('\n📖 See apps/api/.env.example for configuration template.\n');
  }

  console.log('==============================================\n');

  return result.valid;
}

/**
 * Validate environment and exit if invalid (production mode)
 * In development, only print warnings but don't exit
 */
export function validateAndFailFast(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const valid = validateAndPrintEnvironment();

  if (!valid) {
    if (isProduction) {
      console.error(
        '💥 FATAL: Cannot start server with invalid environment configuration in production.'
      );
      console.error('    Fix the errors above and restart the server.\n');
      process.exit(1);
    } else {
      console.warn(
        '⚠️  WARNING: Environment validation failed, but continuing in development mode.'
      );
      console.warn('    Please fix the errors above to ensure production compatibility.\n');
    }
  }
}
