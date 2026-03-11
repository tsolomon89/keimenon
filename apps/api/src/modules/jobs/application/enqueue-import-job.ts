import { EnqueueJob, EnqueueJobResult } from './EnqueueJob';
import {
  IMPORT_CONTRACT_VERSION,
  normalizeImportOptions,
  NormalizedImportOptions,
} from '../domain/import-config-contract';
import type { JobConfig } from '../domain/Job';

export interface ImportJobFileInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
}

export interface ImportTenancyContext {
  actorId: string;
  userId: string;
  accountId: string;
  userType: string;
  accountMembership: string;
  userEmail: string;
  accountClass?: 'free' | 'professional' | 'business';
  features?: Record<string, boolean>;
}

export interface ImportTestContext {
  dbPath: string;
  testId?: string;
}

interface BuildImportJobConfigInput {
  files: ImportJobFileInput[];
  importOptions: unknown;
  processingRail: 'multipart' | 'chunked';
  source: string;
  tenancy?: ImportTenancyContext;
  testContext?: ImportTestContext;
  metadata?: Record<string, unknown>;
}

export interface EnqueueImportJobInput extends BuildImportJobConfigInput {
  accountId: string;
  createdBy: string;
}

function buildMetadata(
  importOptions: NormalizedImportOptions,
  processingRail: 'multipart' | 'chunked',
  source: string,
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  return {
    source,
    importContractVersion: IMPORT_CONTRACT_VERSION,
    processingRail,
    processingMode: importOptions.processingMode ?? 'automatic',
    queuedAt: new Date().toISOString(),
    ...(metadata || {}),
  };
}

export function buildImportJobConfig(input: BuildImportJobConfigInput): JobConfig {
  const importOptions = normalizeImportOptions(input.importOptions);

  return {
    files: input.files.map((file) => ({
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      filePath: file.filePath,
    })),
    importOptions,
    tenancy: input.tenancy,
    testContext: input.testContext,
    metadata: buildMetadata(importOptions, input.processingRail, input.source, input.metadata),
  };
}

export async function enqueueImportJob(
  enqueueJobUseCase: EnqueueJob,
  input: EnqueueImportJobInput
): Promise<EnqueueJobResult> {
  const config = buildImportJobConfig(input);

  return enqueueJobUseCase.execute({
    type: 'import',
    accountId: input.accountId,
    createdBy: input.createdBy,
    config,
    idempotencyKey: undefined,
    concurrencyGroup: undefined,
  });
}
