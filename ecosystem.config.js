/**
 * PM2 Ecosystem Configuration
 * Canvas Memory OS - Production Process Management
 *
 * Usage:
 *   pm2 start ecosystem.config.js                    # Start all apps
 *   pm2 start ecosystem.config.js --only api         # Start only API
 *   pm2 start ecosystem.config.js --env production   # Use production env
 *   pm2 logs                                         # View logs
 *   pm2 monit                                        # Monitor processes
 *   pm2 restart all                                  # Restart all
 *   pm2 stop all                                     # Stop all
 *   pm2 delete all                                   # Delete all
 */

module.exports = {
  apps: [
    // API Server (Backend)
    {
      name: 'canvas-api',
      script: 'apps/api/dist/index.js',
      cwd: '.',
      instances: process.env.API_INSTANCES || 2,  // Use 2 instances for load balancing
      exec_mode: 'cluster',                         // Cluster mode for multi-core utilization
      watch: false,                                 // Don't watch in production
      max_memory_restart: '500M',                   // Restart if memory exceeds 500MB

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 4001,
        STORAGE_MODE: 'local',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4001,
        STORAGE_MODE: process.env.STORAGE_MODE || 'local',
        JWT_SECRET: process.env.JWT_SECRET,
        SQLITE_PATH: process.env.SQLITE_PATH || '~/.canvas-memory/canvas.db',
        LOCAL_DOCS_PATH: process.env.LOCAL_DOCS_PATH || '~/.canvas-memory',
      },

      // Auto-restart configuration
      autorestart: true,
      max_restarts: 10,                             // Max 10 restarts in min_uptime window
      min_uptime: '10s',                            // Minimum uptime before considering stable
      restart_delay: 4000,                          // Wait 4s before restarting

      // Error handling
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,                                   // Prefix logs with timestamp
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',    // Log timestamp format

      // Log rotation (requires pm2-logrotate module)
      // Install: pm2 install pm2-logrotate
      merge_logs: true,                             // Merge cluster logs

      // Health monitoring
      listen_timeout: 8000,                         // Wait 8s for app to be ready
      kill_timeout: 5000,                           // Wait 5s before force killing

      // Advanced settings
      instance_var: 'INSTANCE_ID',                  // Expose instance ID as env var
      post_update: ['npm install', 'npm run build:api'],  // Run after code update

      // Graceful shutdown
      wait_ready: true,                             // Wait for process.send('ready')
      shutdown_with_message: false,
    },

    // Frontend (Web UI)
    {
      name: 'canvas-web',
      script: 'apps/web/.next/standalone/server.js',  // Next.js standalone output
      cwd: '.',
      instances: 1,                                 // Single instance for Next.js
      exec_mode: 'fork',                            // Fork mode (not cluster)
      watch: false,
      max_memory_restart: '300M',

      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'http://localhost:4001',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001',
        NEXT_PUBLIC_STORAGE_MODE: process.env.STORAGE_MODE || 'local',
      },

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_file: './logs/web-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      merge_logs: true,
      listen_timeout: 8000,
      kill_timeout: 5000,

      post_update: ['npm install', 'npm run build:web'],
    },

    // Background Jobs (Optional - for scheduled tasks)
    {
      name: 'canvas-jobs',
      script: 'apps/api/dist/jobs.js',              // Create this file for background jobs
      cwd: '.',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      cron_restart: '0 3 * * *',                    // Restart daily at 3 AM

      env_production: {
        NODE_ENV: 'production',
        SQLITE_PATH: process.env.SQLITE_PATH || '~/.canvas-memory/canvas.db',
      },

      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 10000,

      error_file: './logs/jobs-error.log',
      out_file: './logs/jobs-out.log',
      time: true,

      // Only start if jobs file exists
      ignore_watch: ['node_modules', 'logs'],
    },
  ],

  deploy: {
    // Production deployment configuration
    production: {
      user: 'deploy',
      host: ['api.canvas-memory.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/canvas-memory-os.git',
      path: '/var/www/canvas-memory',

      // Pre-deploy commands
      'pre-deploy-local': '',
      'pre-deploy': 'git fetch --all',

      // Post-deploy commands
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production && pm2 save',

      // Environment
      'env': {
        NODE_ENV: 'production'
      }
    },

    // Staging deployment configuration
    staging: {
      user: 'deploy',
      host: ['staging.canvas-memory.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/canvas-memory-os.git',
      path: '/var/www/canvas-memory-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging && pm2 save',
      'env': {
        NODE_ENV: 'staging'
      }
    },
  },
};

/**
 * Quick Start Guide
 *
 * 1. Install PM2 globally:
 *    npm install -g pm2
 *
 * 2. Build the application:
 *    npm run build
 *
 * 3. Start with PM2:
 *    pm2 start ecosystem.config.js --env production
 *
 * 4. Save PM2 configuration:
 *    pm2 save
 *
 * 5. Setup PM2 to start on system boot:
 *    pm2 startup
 *    # Follow the command it outputs
 *
 * 6. Monitor processes:
 *    pm2 monit          # Live monitoring dashboard
 *    pm2 list           # List all processes
 *    pm2 logs           # View logs
 *    pm2 logs api       # View logs for specific app
 *
 * 7. Manage processes:
 *    pm2 restart all    # Restart all apps
 *    pm2 reload all     # Zero-downtime reload
 *    pm2 stop all       # Stop all apps
 *    pm2 delete all     # Delete all apps
 *
 * 8. Scale applications:
 *    pm2 scale canvas-api 4    # Scale API to 4 instances
 *
 * 9. Install log rotation (recommended):
 *    pm2 install pm2-logrotate
 *    pm2 set pm2-logrotate:max_size 10M
 *    pm2 set pm2-logrotate:retain 7
 *    pm2 set pm2-logrotate:compress true
 *
 * 10. Deploy from CI/CD:
 *     pm2 deploy production setup      # First time setup
 *     pm2 deploy production update     # Deploy updates
 *
 * Performance Tips:
 * - Use cluster mode for API (already configured)
 * - Set instances to number of CPU cores: API_INSTANCES=4 pm2 start ...
 * - Monitor memory usage with pm2 monit
 * - Enable log rotation to prevent disk fill
 * - Use pm2 reload for zero-downtime deploys
 *
 * Troubleshooting:
 * - Process crashes immediately: Check logs with pm2 logs
 * - Out of memory: Increase max_memory_restart or optimize code
 * - Port already in use: pm2 delete all and try again
 * - Can't connect: Check firewall and PM2 status
 */
