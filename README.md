# TrueMarketing

Multi-tenant campaign orchestration for Bitrix24. React 19 + Vite + TypeScript interface, NestJS 11 API. This is a clean local setup build; live integration and production storage are unfinished.

## Start

Requires Node.js 24+. Dependencies are installed. Run npm start, then open http://localhost:4310. Alternatively double-click Start-TrueMarketing.cmd.

Sign in with the provisioned Bureau or Mazeed credentials. There are no demo sign-in buttons. Bureau's platform Super Admin must enroll an authenticator at first sign-in. No sample CRM data remains.

## Develop and verify

- npm run build: compile React and the NestJS API.
- npm run typecheck: strict TypeScript checks.
- npm test: isolated domain and HTTP tests; demonstration fixtures are used only in temporary test databases.
- npm run test:browser: Chrome browser checks against an isolated copy of the clean account database. This command requires the local credential handoff file and Chrome at its standard Windows installation path. It does not modify either company workspace.

## Current account model

Cultiv Bureau has a platform Super Admin and company Owner. Mazeed has its own company Owner using a username, with no invented email address. Passwords and API keys use Argon2id. Platform accounts use RFC6238 authenticator verification, encrypted secrets, single-use codes and expiring login challenges. Session cookies are HttpOnly and mutations require CSRF headers.

## Data and source

- apps/api: NestJS request handling, auth, permissions, tenant and console routes.
- apps/web: React UI, brand assets, local typography.
- apps/worker and packages/core: campaign logic, tenant repositories and the local development worker.
- prisma: production schema and RLS drafts; these are not active.
- data/truemarketing.sqlite: persistent local company data.
- data/auth-key.bin: local encryption key; preserve it with database backups.
- data/account-credentials.json: private credential handoff; excluded from Git and never served.
- tests: isolated fixtures and automated security/domain checks.

Normal startup never seeds demo records. The fixture seed requires both APP_MODE=test and SEED_DEMO=true and should be used only with a temporary DATABASE_FILE. The provisioning script is a one-time, guarded migration and refuses to overwrite accounts.

All written source is local. The configured Git remote is cultiv-bureau/truemarketing, but the execution environment denied Git metadata writes, so the source remains uncommitted and has not been pushed.

## Production status

Do not treat this build as live. SQLite is the local adapter; PostgreSQL/Prisma/RLS and pg-boss runtime integration are pending. Live Bitrix OAuth/install/SSO, CRM queries and workflow starts are pending. Public HTTPS hosting, account recovery/email delivery, and full live acceptance testing are also pending. Production startup is blocked, and creating audiences or campaigns without a verified live CRM connection is blocked. No simulated executions are exposed in the clean workspace.

The newer scope specifies DigitalOcean and supersedes the old Render blueprint. Nothing has been deployed. See BUILD-STATUS.md for current verification and go-live blockers.

## Access from a second laptop

The code and database currently live on DESKTOP-54KH493. Use Start-TrueMarketing.cmd to launch the server in the background with an optional listener on its existing private IPv4 address. On the server laptop, use http://localhost:4310. On another laptop on the same network, use http://192.168.1.100:4310 (the current address). Keep the server laptop on and awake. The shortcut prints the current network address if DHCP changes it. No public tunnel or firewall rule was created. This is private-network development access, not production HTTPS hosting.
