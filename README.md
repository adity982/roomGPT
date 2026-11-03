# [RoomGPT](https://roomGPT.io) - redesign your room with AI

## Proposal Studio (This Fork)

For the hosted release, see [production configuration and operations](docs/PRODUCTION.md).
Setting `STUDIO_DATABASE_URL` enables managed persistence; the filesystem adapter
is retained only for local development and isolated tests.

The default screen is now `/studio`: a workspace for living-room concepts,
itemized budgets, design history, and client review. The original generator is
still available at `/dream`. This fork is independent of the official RoomGPT
service; the original MIT attribution is retained in `LICENSE`.

### Try It Locally

Requires Node.js 20.9+ and npm. Run `npm ci`, then `npm run dev` and open
`http://localhost:3000/studio`. Create a studio account and choose **Open sample
project** to explore the full workflow without a model API key. Sample images
are bundled examples; all sample prices are illustrative.

1. Create a client project and record the brief, retained furniture, site notes,
   and room budget in INR.
2. Upload a room photo, capture one with the camera, or upload a designer concept.
3. Choose a base image and request targeted AI edits. Each output becomes a new
   immutable image version. Compare versions with the image slider.
4. Add budget items, supplier links, quantities, quoted/estimated prices,
   delivery, installation, and contingency. Save and export CSV as needed.
5. Select a concept and share a proposal. The link freezes that image and budget.
   Clients can comment, request changes, approve, or print to PDF. Links expire
   after seven days and can be revoked. Later project edits do not alter an
   earlier approval.

### AI Configuration

Use `.env.local` for server secrets; `.example.env` lists the configuration keys.
Set `REPLICATE_API_KEY` to enable the Replicate FLUX Kontext Pro image-editing
integration. It creates a provider job and returns immediately, then checks
progress without holding an API request open. The app permits one active job per
project and 30 generation attempts per account per day. Model prompts request
preservation of room geometry and retained items, but outputs still require
designer review. No measured fit or exact product reproduction is promised.

For a hosted pilot, set `STUDIO_PUBLIC_URL` to its public HTTPS origin. Replicate
then receives a private, per-job completion callback URL. The callback checks
the provider's authoritative prediction and saves the output before provider
files expire. Duplicate callbacks do not create duplicate versions. On localhost,
keep the project open until the image is saved; a public callback is unavailable.
Live camera capture preserves the source colors in Studio. Camera color previews
in the classic generator are not spatial AR or live furniture replacement.

### Storage And Hosting

This release uses a private filesystem store under `.studio-data/`, or the
absolute path in `STUDIO_DATA_DIR`. Accounts use salted scrypt password hashes;
sessions use HTTP-only cookies and hashed random tokens. Image requests require
the owner session or an active review token for that specific proposal image.
Review links grant access to anyone holding them; reviewer names are self-entered,
not verified identities or electronic signatures.

Run one Node application instance on a persistent disk for a controlled pilot.
Do not deploy this filesystem adapter directly to ephemeral serverless storage
or run multiple hosts against it. Back up the entire private data directory,
restrict operating-system access, and use HTTPS for remote access. A transaction
uses a directory lock and atomic file replacement. If a process terminates while
holding `write.lock`, stop all Studio processes before removing that lock directory.
Deleting a project revokes its review access; unreferenced image files may remain
in backups or on disk until the operator removes them.

Before a public commercial launch, replace the file adapter with managed database
and object storage, add verified email/password recovery, account deletion and
retention controls, monitoring, and billing. This release does not contain a
checkout, paid subscriptions, automated supplier inventory, or a live spatial
video engine. See [the pilot plan](docs/PILOT.md) for validation and launch scope.

### Verification

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Generation tests mock the external provider; they never spend API credits.
Browser tests run on port 3101 with an isolated private data directory and cover
designer/client workflows, private media, ownership, snapshots, validation,
revocation, and mobile overflow. Screenshots are saved to `test-results/`.

---

This is the previous and open source version of RoomGPT.io (a paid SaaS product). It's the very first version of roomGPT without the auth, payments, or additional features and it's simple to clone, deploy, and play around with.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Nutlope/roomGPT&env=REPLICATE_API_KEY&project-name=room-GPT&repo-name=roomGPT)

[![Room GPT](./public/screenshot.png)](https://roomGPT.io)

## How it works

It uses an ML model called [ControlNet](https://github.com/lllyasviel/ControlNet) to generate variations of rooms. This application gives you the ability to upload a photo of any room, which will send it through this ML Model using a Next.js API route, and return your generated room. The ML Model is hosted on [Replicate](https://replicate.com) and [Bytescale](https://www.bytescale.com/) is used for image storage.

## Running Locally

### Cloning the repository the local machine.

```bash
git clone https://github.com/Nutlope/roomGPT
```

### Creating a account on Replicate to get an API key.

1. Go to [Replicate](https://replicate.com/) to make an account.
2. Click on your profile picture in the top left corner, and click on "API Tokens".
3. Here you can find your API token. Copy it.

### Storing the API keys in .env

Create a file in root directory of project with env. And store your API key in it, as shown in the .example.env file.

If you'd also like to do rate limiting, create an account on UpStash, create a Redis database, and populate the two environment variables in `.env` as well. If you don't want to do rate limiting, you don't need to make any changes.

### Installing the dependencies.

```bash
npm install
```

### Running the application.

Then, run the application in the command line and it will be available at `http://localhost:3000`.

```bash
npm run dev
```

## One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=vercel-examples):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Nutlope/roomGPT&env=REPLICATE_API_KEY&project-name=room-GPT&repo-name=roomGPT)

## License

This repo is MIT licensed.
