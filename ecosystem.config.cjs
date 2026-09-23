/**
 * PM2 process definition for the Workforce backend.
 *
 *   npm run build && npm run pm2:start
 *
 * Runtime configuration is read from `.env` in this directory (server.ts loads
 * dotenv), so only NODE_ENV is set here.
 *
 * The API runs in fork mode with a single instance on purpose: Socket.IO keeps
 * in-memory connection state, so cluster mode needs sticky sessions plus a
 * shared adapter before it can be scaled up.
 */
module.exports = {
  apps: [
    {
      name: "workforce-api",
      script: "dist/src/server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      restart_delay: 2000,
      kill_timeout: 10000,
      max_memory_restart: "600M",
      time: true,
      merge_logs: true,
      out_file: "logs/api-out.log",
      error_file: "logs/api-error.log"
    },
    {
      name: "workforce-missing-checkouts",
      script: "dist/src/jobs/missing-checkouts.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      // One-shot job: PM2 only restarts it on the cron schedule.
      autorestart: false,
      cron_restart: "*/15 * * * *",
      time: true,
      merge_logs: true,
      out_file: "logs/missing-checkouts-out.log",
      error_file: "logs/missing-checkouts-error.log"
    },
    {
      name: "workforce-attendance-reminders",
      script: "dist/src/jobs/attendance-reminders.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      autorestart: false,
      cron_restart: "*/5 * * * *",
      time: true,
      merge_logs: true,
      out_file: "logs/attendance-reminders-out.log",
      error_file: "logs/attendance-reminders-error.log"
    },
    {
      name: "workforce-auto-checkouts",
      script: "dist/src/jobs/auto-checkouts.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production" },
      autorestart: false,
      cron_restart: "*/5 * * * *",
      time: true,
      merge_logs: true,
      out_file: "logs/auto-checkouts-out.log",
      error_file: "logs/auto-checkouts-error.log"
    }
  ]
};
