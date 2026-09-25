# Viva

Warehouse, inventory, expense, distribution, and business management for multi-location Nigerian operations.

- `viva/`: React, Vite, Tailwind CSS, React Router, TanStack Query, Axios, Recharts, IndexedDB, and PWA service worker.
- `api/`: Express 5, MySQL, Sequelize, server-side sessions, permission and location middleware, transactional services, and versioned migrations.

## Run locally

Requires Node.js 20.19+ and MySQL 8+. Your existing `api/.env` is preserved and excluded from Git.

```powershell
cd api
npm install
# Configure DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS in .env.
# PORT=8000 and APP_ORIGIN=http://localhost:5173
npm run migrate
```

Create the first administrator explicitly. There are no default credentials:

```powershell
$env:BOOTSTRAP_EMAIL = 'admin@your-company.com'
$env:BOOTSTRAP_NAME = 'Company Administrator'
# Set BOOTSTRAP_PASSWORD to a unique password of at least 12 characters.
npm run bootstrap
Remove-Item Env:BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
npm run dev
```

In a second terminal:

```powershell
cd viva
npm install
npm run dev
```

Open **http://localhost:5173**. Use that hostname consistently, as cookies and origin checks are host-specific. The Vite proxy points to port 8000; set the `VIVA_API_URL` environment variable when using another backend port.

After signing in: create locations, warehouses, categories, products, and team members. Assign location access to staff and accountants. Create a second authorized reviewer because people cannot approve their own corrections, expense submissions, or transfers. Link distributor accounts to distributor records.

## Workflows

- Receipts, dispatches, damaged goods, returns, allocations, and distributor returns share an immutable stock movement ledger.
- Available stock is on-hand quantity minus reserved stock; damaged stock is tracked separately.
- Reservations protect committed stock and have an explicit, audited release workflow. Physical stock counts preserve expected and observed quantities, with any difference submitted as an approval-controlled adjustment.
- Distributors can confirm receipt of their own allocated deliveries. They cannot access another distributor's transactions or internal financial fields.
- Warehouse and inventory row locks protect concurrent mutations. Every submitted stock operation carries the expected stock version and a unique operation UUID.
- Transfers proceed through pending → approved → in transit → received. Release subtracts source stock; receipt adds destination stock. Rejected and unreleased cancelled transfers do not move stock.
- Product, location, warehouse, distributor, and expense corrections retain original values until approval. A stale correction cannot overwrite a newer record version.
- Expenses start pending and generate an authorization request. Dashboard expense totals include approved expenses.
- CEO access is predominantly read-only. Role permissions are stored in the database, and location scopes are checked by the API. Distributor routes expose only linked distribution records.
- CSV exports are permission-scoped, protected against spreadsheet formula injection, and capped at 10,000 matching records. Narrow filters for larger datasets.

## Offline behavior

Use `npm run build` and serve the production output to test installable PWA behavior. The development server does not install the production service worker.

The application caches its static shell and user-scoped business reads. Authentication uses an HttpOnly session cookie; passwords, session tokens, and CSRF secrets are never stored in IndexedDB or localStorage. A cached non-secret profile permits offline reopening until the last verified server session expiry. Its permissions are only a user-interface hint: every synchronized operation is reauthorized on the server.

Supported offline stock operations require a previously loaded product/warehouse stock snapshot. Operations are persisted before submission, retain the original action timestamp, and remain visible in Sync Center. Automatic foreground retry runs every 30 seconds and on reconnect. Supporting browsers also schedule a service-worker background sync; browser scheduling is best-effort, and signing in may be necessary before retrying.

Conflicts are never automatically forced through. An administrator records reconciliation notes and submits a separate new operation if required. The original failed/conflicting record is retained. Local queue export allows recovery outside the normal sync path. Signing out clears cached reads and the profile, but retains the user-partitioned operation history. Browser storage is device-local; clearing browser data removes unsynchronized work.

## Security and deployment

For the Vercel frontend, set the project root to `viva/`. Its `vercel.json` proxies `/api/*` to the existing backend before the SPA fallback. The browser always calls relative `/api` URLs so session cookies remain first-party on iPhone PWAs. `VITE_API_URL` no longer selects a browser-side API origin; use `VIVA_API_URL` to override the local Vite proxy target. API proxy responses must not be cached.

- Passwords use bcrypt; server session and CSRF identifiers use cryptographically random values, with hashes stored in MySQL.
- Cookies are HttpOnly and SameSite=Strict, with Secure enabled in production. Mutations enforce both the configured Origin and a session-bound CSRF token.
- Helmet, request size limits, login/API throttling, Zod validation, ORM parameterization, audit logging, and sanitized error responses are enabled.
- Protected business records have archive/status semantics instead of public delete endpoints. The API has no audit-log deletion route.
- Configure `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, database TLS as required, and a least-privilege MySQL runtime account. Run migrations separately with a schema-management account. The application never synchronizes schema during normal startup.
- Serve the frontend and `/api` under one HTTPS origin. `deploy/nginx.conf` gives the reverse-proxy shape. Use your TLS ingress or proxy for certificates. Set `TRUST_PROXY=1` only with exactly one trusted reverse proxy; do not expose the application port publicly in that configuration.
- The supplied rate limiter is process-local. Multiple API replicas require a shared limiter store. Database sessions and operation idempotency are shared already.
- Schedule database backups and restore drills, expire old sessions, retain audit history according to company policy, and collect JSON application logs. System Health provides database/API checks, login failures, recorded errors, and sync conflicts.

Receipt attachments currently use HTTPS reference links; binary upload storage and malware scanning are not included. CSV export is implemented; PDF and native Excel rendering remain extension points. Receipts, issues, and transfers currently carry one product per reference. A company-wide legal accounting ledger, payroll, invoicing, and external payment processing are outside these operational modules.

## Verification

```powershell
cd api
npm test
npm run test:integration
cd ../viva
npm run lint
npm run build
node e2e.mjs
```

Integration and browser tests use a separate database: `TEST_DB_NAME`, or the configured database name with `_test` appended. The test database name must end in `_test` and must differ from the normal database. Run `node scripts/prepare-tests.js` from `api` first. This requires permission to create the test database. Tests create uniquely identified fixtures and remove them afterward.

After preparing the test database, run `npm run build` and `node e2e.mjs` from `viva`. The browser suite starts and closes its own isolated API and production preview on ports 8418 and 8417. It includes service-worker control and offline reload checks. Chrome must be installed. These tests use real MySQL-backed operations rather than mocked responses.

The backend suite covers secure sessions, CSRF, role/location isolation, exact quantities, competing withdrawals, idempotent retry, stale approvals, independent review, adjustments, transfer conservation, financial approval, reporting, and audit/health endpoints.

Implementation references: [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), [Sequelize transaction locks](https://sequelize.org/docs/v6/other-topics/transactions/), [Vite PWA service-worker strategies](https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors).
