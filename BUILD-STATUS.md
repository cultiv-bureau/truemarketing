# TrueMarketing hosted deployment

The React interface, tenant permissions, account authentication, TOTP, CSRF checks and clean Bureau/Mazeed accounts are implemented. No sample operational data is included in the account migration.

Vercel now has a Node 24 serverless entry point and a transitional PostgreSQL persistence adapter. PostgreSQL is authoritative. Each request locks the state row, restores an in-memory SQLite query engine, commits encrypted state, and only then returns its response. Sessions, rate limits and two-factor challenges survive function restarts. No SQLite file is used for hosted persistence.

This is a low-volume administration adapter. Normalized PostgreSQL repositories and database-enforced tenant RLS are not implemented. Replace the serialized adapter before high-volume campaigns.

A fresh free-plan Prisma database, truemarketing-production, was created. A read-only connectivity query returned connection_ok = 1. The old Malaz-linked Early Access database was left untouched; Prisma reports its scheduled deletion on 1 November 2026 at 00:00 UTC.

Build and strict TypeScript checks passed. All 24 backend tests passed, covering permissions, tenant isolation, CSRF, API keys, suspension, TOTP replay rejection, state restoration and encrypted challenge persistence. HTTP tests ran through the development runtime because the terminal sandbox blocks network connections.

Production requires the prefixed Prisma PostgreSQL connection variable plus TOKEN_ENCRYPTION_KEY and TM_BOOTSTRAP_STATE. The latter two are prepared in ignored data/hosted-env.json. Bootstrap runs only when the hosted state row does not exist and cannot overwrite an existing row. Local sessions are excluded from migration. Never commit this file or its values.

Production environment-variable creation was denied by the connector, and the attempted browser environment-page read was rejected by browser security. Hosted authentication must not be claimed as verified until these secrets are installed and end-to-end tests pass.

Hosted administration is distinct from live campaign readiness. Live Bitrix OAuth/SSO, metadata queries, workflow execution and durable campaign scheduling remain unimplemented and blocked. Email recovery and final security/load acceptance testing remain outstanding.
