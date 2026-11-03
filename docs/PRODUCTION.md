# Production Deployment

The production target is the `roomgpt-studio` Vercel project in
`adity982s-projects`. The managed database is `roomgpt-studio-production` in the
selected Supabase organization, region `ap-south-1` (Mumbai).

## Persistence

`STUDIO_DATABASE_URL` selects the managed Postgres adapter. Accounts, sessions,
projects, rate-limit records, and image bytes are persisted in the unexposed
`roomgpt_private` schema. The runtime role has CRUD access only to those tables,
not database administration privileges. RLS is enabled, with access restricted
to this trusted server role. Browser clients never receive database credentials.

The adapter retains the pilot's mutation contract: reads use consistent snapshots
and writes acquire a transaction-scoped advisory lock. This ensures atomic edits
across server instances. The initial implementation loads project metadata into
server memory; partition queries by account and replace the coarse write lock
before substantial concurrent usage. Images are stored separately as bytea and
are not loaded into metadata reads. An individual upload is limited to 3 MB to
fit the hosting platform's request and response limits.

The database connection uses Supabase's pooled endpoint, disables prepared
statements for transaction pooling, and verifies TLS certificates and hostnames
against the included public Supabase root CA. The certificate source is recorded
in `db/supabase-ca.json`.

`db/production.sql` records the applied schema migration. Runtime credentials are
generated locally and stored in ignored configuration. The operator-only password
rotation function is not executable by the application role. No database password
is committed or included in migration history.

## Runtime Configuration

- `STUDIO_DATABASE_URL`: required server-only secret for production.
- `REPLICATE_API_KEY`: optional server-only secret to enable paid image generation.
  Without it, uploading and reviewing designer-made concepts remains available.
- `STUDIO_PUBLIC_URL`: optional canonical HTTPS origin. On Vercel,
  `VERCEL_PROJECT_PRODUCTION_URL` supplies the default callback origin.

Configure these on the exact Vercel project before deploying. Production secrets
are not shared with preview builds. The app returns an error when deployed on
Vercel without managed storage; it never silently writes private data to
ephemeral filesystem storage. The unauthenticated classic generation endpoint
is disabled on Vercel so it cannot bypass Studio's account quotas.

## Release Process

1. Run `npm test` and `npm run test:e2e`.
2. Run `node scripts/test-managed.mjs` after the production connection probe.
   This runs the same browser workflows against managed storage with synthetic
   test accounts. Test artifacts remain local and ignored.
3. Verify the linked Vercel team and project. Stage with `vercel deploy --prod
   --skip-domain`, using the source build on Vercel rather than Windows build
   output. `.vercelignore` excludes local environment files and private data.
4. Verify the staged application, API, persistent uploads, and review links.
5. Promote the tested deployment to the production domain, then inspect errors.

The local preview uses `.next-dev`; production and browser verification use
`.next`, allowing the local preview to remain open during release checks.

## Operations

Restrict access to the Supabase and Vercel dashboards, configure database backups
appropriate to the chosen service plan, and review usage before expanding a
pilot. Revoking a review link immediately removes its API and image access.
Database administrators can still access records; review names are self-entered
and do not provide identity verification or a legal e-signature service.

The release retains the existing salted-password account flow. Verified email,
self-service password recovery, subscription billing, supplier inventory syncing,
and continuous spatial video are separate product work, not implied by hosting
the existing five-feature Studio workflow.
