# TrueMarketing

TrueMarketing is hosted at https://truemarketing.vercel.app.

React 19 + Vite + TypeScript UI, NestJS application service, and an Express serverless entry point on Vercel. Node.js is pinned to 24.x.

## Company access

Bureau has a platform Super Admin and company Owner. Mazeed has a separate company Owner. Existing passwords are preserved. Bureau requires authenticator enrollment. No demonstration accounts or operational sample records are provisioned in the hosted workspace.

## Verification

The production deployment passed public health, Mazeed browser sign-in, reload/session persistence, protected collection requests, clean workspace checks, and Bureau's required two-factor challenge. The backend suite has 24 passing tests. Source and brand assets are committed to GitHub; credentials and bootstrap material are excluded.

## Persistence and security

The transitional hosted adapter uses encrypted state in PostgreSQL as the authoritative store. Requests serialize through a database transaction lock; SQLite is only an in-memory query engine. Sessions, rate limits and challenges persist across instances. Responses are returned after the database commits. Hosted cookies are Secure/HttpOnly/SameSite, mutations require CSRF, passwords use Argon2id, and authentication secrets use AES-256-GCM. Database TLS uses verify-full.

The adapter suits low-volume administration. Normalized PostgreSQL repositories, tenant RLS and a durable campaign worker are not implemented. Replace this serialized adapter before high-volume use.

## Product limitations

Hosted login and administration are available. Live Bitrix OAuth/SSO, CRM queries, workflow starts, scheduling, email recovery and full production campaign acceptance remain unfinished. Campaign execution is blocked until a live integration is implemented and verified. No real marketing messages have been sent.

## Local development

Run npm ci, npm run build, npm start. Open http://localhost:4310. Run npm run typecheck and npm test for checks. Local accounts/data remain under ignored data/. Tests use isolated fixture databases.

## Deployment

Vercel project: cultiv-bureau/truemarketing. PostgreSQL resource: truemarketing-production. The old Early Access database was disconnected only from TrueMarketing; Malaz was preserved. Production needs the prefixed Prisma PostgreSQL variables, TOKEN_ENCRYPTION_KEY, and TM_BOOTSTRAP_STATE. Bootstrap applies only if the hosted state row is absent. Never commit secrets or copy production secrets into preview deployments.

