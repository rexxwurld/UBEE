# U-BEE backend

Digital-banking API for **U-BEE**, the .NET MAUI mobile app — account
registration, MFA, wallets, transfers, KYC, disputes, and admin ops.

This backend is also the (currently mocked) bank partner that a separate
system, **RexxPay Infra** (the SwiftPay-branded merchant checkout
processor other apps integrate against — see `src/modules/bankPartner/`
and `SWIFTPAY_WEBHOOK_*` in `.env.example`), calls into for settlement.
That's a real external contract with its own consumers (e.g. LetsHelp's
checkout integration) — don't rename `RexxPay Bank` or the `swiftpay`
partner slug; they're the identity another live service uses for this
bank, not this app's own branding.

## Tech stack

Node.js, Express, MongoDB (replica set — multi-document transactions are
used everywhere money moves), JWT access + refresh tokens, Mongoose,
bcrypt.

## API surface

Full spec: `docs/openapi.yaml`. Summary, all under `/api/v1`:

| Area | Routes |
|---|---|
| Auth | `auth/register`, `auth/login`, `auth/login/mfa-verify`, `auth/token/refresh`, `auth/logout`, `auth/me`, `auth/forgot-password`, `auth/reset-password` |
| Sessions | `auth/sessions` (list/revoke active devices) |
| Wallet | `wallet` |
| Transactions | `transaction` (history), `transaction/transfer` |
| KYC | `kyc/submit`, `kyc/status` |
| Disputes | `disputes` |
| Admin | `admin/*` — deposits, adjustments, KYC review, partners, reconciliation, disputes, ops (see `docs/openapi.yaml`'s admin section for the full, separately-documented list) |

## Getting started

```
cp .env.example .env   # fill in JWT_SECRET, MONGO_URI (replica set), etc.
npm install
npm run dev             # http://localhost:4000
```

Or `docker compose up` for a local Mongo replica set + the app together.

## Testing

```
npm run test               # unit tests
npm run test:integration   # incl. tests/integration/mobileContract.test.js,
                            # which plays back U-BEE's exact API calls end to end
npm run test:all
```

## What's real vs. mocked

- Real: ledger-backed double-entry accounting, idempotent transfers,
  tiered KYC limits, rate limiting, session/refresh-token auth, audit
  logging, reconciliation job.
- Mocked/stubbed: no real NIBSS/bank-rail connection
  (`src/providers/mockBankProvider.js`), no real SMS/email OTP delivery
  in non-production (`src/modules/otp/otp.service.js` logs codes to the
  console instead), no fraud/AML screening, no license. See
  `docs/BACKUP_AND_DR.md` for the DR story.

## Author

Built by Rexxwurld
