# Tests

Two separate suites, deliberately using two different test runners -
don't merge them into one `npm test` that tries to run everything, it
will crash (see below).

## `tests/unit/` - `node --test`, zero dependencies

Run with `npm test`. Uses Node's built-in test runner
(`node:test`/`node:assert`), not Jest - specifically so these can run
in *any* environment, including one with no network access to `npm
install` anything (which is exactly how these were originally written
and verified - every test in this directory was actually executed, not
just written, before being committed).

Covers pure logic with no MongoDB/network dependency: field encryption
(`src/utils/fieldEncryption.js`), webhook HMAC signing/verification
(`src/utils/webhookSignature.js`), the `AsyncLocalStorage`-based request
context (`src/utils/requestContext.js`), tiered transfer limits
(`src/config/limits.js`), the bank-provider interface/registry/mock
(`src/providers/`), and the validation middleware itself
(`src/middleware/validate.js` - including a regression test for the
Express 5 `req.query` getter-only bug found and fixed during Phase 4;
if that ever breaks again, this test catches it immediately).

**Does NOT require `npm install` for these specific files to run**,
because none of them import anything outside Node's standard library.
The rest of the app (`express`, `mongoose`, `zod`, etc.) does need real
`npm install` to run at all, obviously - this just means the unit
suite alone has no *additional* dependency beyond what running the app
already needs.

## `tests/integration/` - Jest + `mongodb-memory-server`

Run with `npm run test:integration` (requires `npm install` first).
Covers the DB-dependent service layer: `adjustment.service.js` (the
Phase 1 replacement for the original money-creation vulnerability -
these tests specifically prove it's ledgered and idempotent) and
`transaction.service.js`'s `transfer()` (the double-entry invariant:
every transfer's debit+credit ledger legs must net to zero).

Uses `MongoMemoryReplSet`, not a plain `MongoMemoryServer` - this
codebase requires a **replica set** for its multi-document transactions
(see `.env.example`'s comment on `MONGO_URI`), and testing against a
non-replica-set in-memory Mongo would let a test suite pass in CI while
the same code fails against a real standalone MongoDB in some other
environment. See `tests/integration/setup.js` for the detail.

**Not executed in the sandbox these were originally written in** - no
network access to download the in-memory MongoDB binary
`mongodb-memory-server` needs. Written correctly by inspection and
cross-referenced against this codebase's actual schema/service
signatures, but genuinely unverified by an actual run. Run
`npm run test:integration` yourself and treat the first run as
verification, not just execution.

## Running everything

```
npm run test:all
```
Runs both suites back to back. CI (`.github/workflows/ci.yml`) runs
them as two separate steps so a unit-test failure is visibly distinct
from an integration-test failure in the CI log.

## What's not covered yet

This is a starting suite, not comprehensive coverage. Notably still
untested: payout/refund provider-outcome branching (accepted/rejected/
ambiguous - Phase 5), the reconciliation exception queue's upsert/auto-
resolve logic (Phase 6), the recovery job's provider-status-check
resolution path (Phase 5/2), and every HTTP route end-to-end (all
current tests call service-layer functions directly, not through
Express - a `supertest`-based route-level suite would be a reasonable
next addition).
