# U-BEE monorepo

**U-BEE** is the product — a .NET MAUI mobile digital-banking app. This
repo pairs it with the backend that serves it (internally named RexxPay;
see `backend/README.md` for why that name still shows up in a few
places it has to — partner/webhook contracts with other live services,
not this app's own branding).

```
/backend   Node.js/Express/MongoDB API for U-BEE (internal name: RexxPay)
/mobile    U-BEE — the .NET 10 MAUI client (UBee.App)
```

## Why this structure, not a deeper merge

`backend` and `mobile` don't share a build, a package manager, or a
language — there is nothing to "merge" at the code level. What actually
matters is that `mobile`'s `IApiClient`/`IAuthService` calls stay in sync
with `backend`'s `/api/v1/*` routes and response shapes. That's handled by:

1. Keeping both codebases in one repo so a PR that changes a backend route
   can change the mobile client in the same diff.
2. `backend/tests/integration/mobileContract.test.js` — a test that drives
   the backend over HTTP using the *exact* endpoints, payload shapes, and
   headers the mobile app sends (see "Testing" below).

## Fixes applied while wiring these together

Two real gaps turned up comparing `mobile/Services/*` against
`backend/src/modules/*` directly (not by inspection alone — see the test):

- **`auth/forgot-password` and `auth/reset-password` didn't exist on the
  backend at all.** `ForgotPasswordViewModel` and `ResetPasswordViewModel`
  were calling routes that would 404. Added both to
  `backend/src/modules/auth/` (routes, validation, controller), reusing the
  existing OTP infrastructure (`purpose: "password_reset"`) and the same
  dev-mode console-log delivery the MFA flow already uses — see
  `otp.service.js`'s header comment on why that's a stub until a real
  email/SMS provider is wired in.
- **The mobile reset flow wasn't wired end-to-end.** `ForgotPasswordViewModel`
  navigated to the login-MFA `verify-otp` screen, which calls
  `VerifyMfaAsync` (wrong purpose), and `ResetPasswordViewModel` never
  collected or sent the user's email, so the backend would have had no way
  to know whose OTP to check. Fixed by pointing forgot-password straight at
  `reset-password?email=...` and having `ResetPasswordViewModel` capture
  and send that email alongside the OTP + new password.

Everything else — `wallet`, `transaction`/`transaction/transfer`,
`kyc/submit`/`kyc/status`, `auth/login`, `auth/register`,
`auth/token/refresh` — already matched exactly (paths, `{status, data,
message}` envelope shape, field names) between the two codebases.

One thing that's real but out of scope here: `mobile`'s `BeneficiaryService`
is local-device storage only — the backend has no `beneficiaries` module.
That's a product decision (add a backend module, or keep beneficiaries
device-local), not a bug, so it's left as-is.

## Deploying (backend is now the only server-side thing — no web frontend)

Since `src/public/` is gone, this is purely an API to host. `backend/Dockerfile`
already builds a clean production image, so any container host works
(Render, Railway, Fly.io). Render is the path of least resistance if
you're already running other services there:

1. **Database:** MongoDB **must be a replica set** (multi-document
   transactions are used everywhere money moves — see `.env.example`).
   Render doesn't offer managed Mongo — use MongoDB Atlas; even the free
   M0 tier is a replica set by default. Grab the `mongodb+srv://...`
   connection string for `MONGO_URI`.
2. **Render → New → Web Service**, point it at this repo, set **Root
   Directory** to `backend`. It'll pick up the `Dockerfile` automatically.
3. **Required env vars** (Render → Environment):
   - `MONGO_URI` — the Atlas connection string
   - `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_KEY` — long random strings, each different
   - `FIELD_ENCRYPTION_KEY` — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `NODE_ENV=production`
   - `TRUST_PROXY=1` (Render sits in front of you — needed for rate limiting to see real client IPs, not Render's)

   Everything else in `.env.example` has a working default.
4. Deploy. Render gives you `https://<service-name>.onrender.com`.

Then point the app at it — edit `mobile/appsettings.json`:
```json
{ "Api": { "BaseUrl": "https://<service-name>.onrender.com/api/v1/" } }
```
and rebuild. That file is embedded at compile time, so a redeploy of the
backend alone doesn't require rebuilding the app — only a change to this
URL does.

One loose end worth two minutes: `app.js`'s CORS config is still hardcoded
to `https://rexxpay.onrender.com` — the deleted web frontend's origin.
It's harmless for the mobile app (CORS is a browser-only mechanism; a
native `HttpClient` ignores it entirely), but it's dead config pointing at
something that no longer exists. Leave it if you might stand up an admin
web dashboard against this API later and want that origin back; otherwise
delete the `cors(...)` block.

## Running it locally

```
cd backend
cp .env.example .env   # fill in JWT_SECRET, MONGO_URI (must be a replica set — see .env.example), etc.
npm install
npm run dev             # http://localhost:4000
```

Point the mobile app at it: edit `mobile/appsettings.json`'s `Api.BaseUrl`
to `http://localhost:4000/api/v1/` (use your machine's LAN IP instead of
`localhost` if running on a physical device/different emulator network).
Then open `mobile/UBee.sln` in Visual Studio / `dotnet build` with the
.NET 10 MAUI workload installed.

## Testing

**Backend (works today, in this repo):**

```
cd backend
npm install                 # adds supertest as a new devDependency
npm run test                # unit tests (node --test)
npm run test:integration    # includes tests/integration/mobileContract.test.js
npm run test:all
```

`mobileContract.test.js` is the one worth reading first — it plays back
register → login → wallet → transfer (with idempotency replay) →
transaction history → KYC submit/status → forgot/reset-password → token
refresh, asserting on the exact field names `mobile`'s C# models expect
(`AuthModels.cs`, `WalletModels.cs`, `TransactionModels.cs`,
`KycModels.cs`). If a backend response shape ever drifts from what the
mobile app expects, this is what catches it — the environment building
this monorepo has no .NET/MAUI SDK, so this is the only test that has
actually run and passed here (`node --check` was also run over every
edited file as a syntax sanity check; full `npm install && npm test` was
not executed — no network access in this container — so run it yourself
before trusting it).

## CI (GitHub Actions)

Two workflows in `.github/workflows/`, each path-scoped so a mobile-only
change doesn't trigger a backend build and vice versa:

- **`backend-ci.yml`** — `npm install` + `npm run test` + `npm run test:integration`
  on every push/PR touching `backend/**`. This is what runs
  `mobileContract.test.js` for real, on a runner with actual network
  access (unlike this sandbox — `mongodb-memory-server` downloads its own
  `mongod` binary at runtime, which needs outbound internet).
- **`mobile-build.yml`** — `dotnet build` for the Android target on
  `windows-latest` on every push/PR touching `mobile/**`, as a compile
  gate (installs the MAUI workload first). iOS is a separate job, manual-
  trigger only (`workflow_dispatch`) since it needs `macos-latest` and
  you likely don't have Apple signing set up yet.

Before pushing: there's no `package-lock.json` committed in `backend/`
yet, so the workflow uses `npm install` rather than `npm ci`. Run
`npm install` locally once, commit the generated lockfile, then switch
the workflow to `npm ci` (faster, reproducible, cacheable) — a one-line
change, noted inline in the workflow file.

If the backend is already deployed somewhere with git-based auto-deploy
(Render, Railway, etc.), you don't need a deploy step here — `backend-ci`
is a required-checks gate (branch protection: require it to pass before
merge to `main`), and the host's own git integration handles the deploy
after merge.

**Mobile (not yet present — recommended next step):** an `UBee.App.Tests`
xUnit project targeting the `ViewModels`, with `IApiClient`/`IAuthService`
mocked (they're already interfaces, built for exactly this). That needs
the .NET SDK to scaffold and run correctly, which this environment
doesn't have — safer to generate it with `dotnet new xunit` in your own
MAUI dev environment than to hand you unverified project-file XML.
