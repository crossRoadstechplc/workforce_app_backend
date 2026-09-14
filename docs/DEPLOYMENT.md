# Production deployment (PM2)

The backend runs as two PM2 processes defined in `ecosystem.config.cjs`:

| Process | Script | Behaviour |
|---|---|---|
| `workforce-api` | `dist/src/server.js` | Long-running HTTP + Socket.IO server, auto-restarts |
| `workforce-missing-checkouts` | `dist/src/jobs/missing-checkouts.js` | One-shot job, re-run by cron every 15 minutes |

## First install

```bash
npm i -g pm2                  # once per server
git clone <repo> && cd workforce-backend
cp .env.example .env          # then fill in real values (see below)

npm ci
npm run prod:setup            # migrate deploy -> build -> seed admin
npm run pm2:start
npm run pm2:save              # persist the process list
pm2 startup                   # print the boot command, run it once as root
```

### Required `.env` values

`NODE_ENV=production`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` (32+ characters each, unique per environment),
`CORS_ORIGINS` (the real portal/app origins, not `*`), `ADMIN_PORTAL_URL`
(public https URL used in invite emails), the `VAULT_*` PINs and
`VAULT_ENCRYPTION_KEY` (64 hex characters). SMTP, Cloudinary and Firebase are
optional but the invite, attendance-photo and push features stay off without them.

Employee Android updates are controlled by `ANDROID_APP_VERSION`,
`ANDROID_FORCE_UPDATE`, and `ANDROID_RELEASE_URL` (usually a GitHub Release APK
URL). Change those and `npm run pm2:reload` — no database migration. The app
calls public `GET /api/v1/app/version`.

## Admin seed

`npm run db:seed:admin` creates roles, permissions and a **single**
`SUPER_ADMIN` user — no organizations, offices, employees or demo data.

```
email    admin@spx.com
password password123
```

Override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`, and set
`ADMIN_MUST_CHANGE_PASSWORD=true` to force a password change on first login.
The script is idempotent: re-running it resets that admin's password to the
configured value and leaves any other `SUPER_ADMIN` accounts alone.

- Local / source: `npm run db:seed:admin`
- Server / compiled: `npm run db:seed:admin:prod` (needs `npm run build` first)

`npm run db:seed` is the older seed and can pull in demo tenants when
`SEED_DEMO_DATA=true` — do not use it in production.

## Redeploy

```bash
./scripts/deploy.sh                    # pull, install, migrate, build, pm2 reload
SEED_ADMIN=true ./scripts/deploy.sh    # same, plus re-seed the admin
```

Or manually: `git pull && npm ci && npm run db:deploy && npm run build && npm run pm2:reload`.

## Operating

```bash
npm run pm2:status
npm run pm2:logs        # tail workforce-api
pm2 logs workforce-missing-checkouts
npm run pm2:restart
npm run pm2:stop
```

Logs are written to `logs/` in this directory. Add `pm2 install pm2-logrotate`
so they do not grow unbounded.

## Notes

- The API runs in **fork mode with one instance**. Socket.IO keeps connection
  state in memory, so scaling to cluster mode first requires sticky sessions and
  a shared adapter (e.g. Redis).
- Only `NODE_ENV=production` is set by PM2; everything else comes from `.env`,
  which `server.ts` loads via dotenv. After editing `.env`, use
  `npm run pm2:reload` (it passes `--update-env`).
- Terminate TLS in front of the process (nginx/Caddy) and proxy to `PORT`,
  including WebSocket upgrade headers for `/socket.io/`.
