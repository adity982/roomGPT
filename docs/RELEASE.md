# Production Release: 3 November 2026

- Public application: https://roomgpt-studio.vercel.app/studio
- Vercel project: `adity982s-projects/roomgpt-studio`
- Deployment: `dpl_3LsWMyQem65CEUJUFEYFv7HafCuB`
- Application source: `397aea5` on `codex/proposal-studio`
- Runtime region: `bom1`; managed Postgres region: `ap-south-1`

The staged production build was verified through authenticated Vercel access and
promoted without rebuilding. The canonical production domain was then verified
without Vercel authentication. The application still requires its own studio
account for private projects and media.

Verified:

- Five generation/budget regression tests.
- Production build and two browser workflows with isolated filesystem storage.
- The same two browser workflows against managed Postgres.
- Both browser workflows on the public HTTPS production application: signup,
  sample project, budget editing/export, image comparison, private media,
  frozen proposal snapshots, client feedback, approval, revocation, upload,
  ownership checks, input validation, and mobile layouts.
- Supabase security advisor returned no findings; dependency audit reported no
  vulnerabilities; post-deployment Vercel error-log scan returned no records.
- Synthetic test accounts and their images were removed after verification.

The deployment does not have a Replicate API key, so AI generation is disabled.
Designer concept upload, budgets, comparison, and client reviews work without it.
Configure the server-only `REPLICATE_API_KEY` secret and deploy a new version to
enable generation. No real model credits were spent during verification.

Run the browser suite against an explicit deployment with
`STUDIO_TEST_BASE_URL` set to that HTTPS origin. Without it, tests use an isolated
local server. Remote tests create synthetic accounts; clean up their exact IDs
after the run. Never run a destructive blanket cleanup against real users.
