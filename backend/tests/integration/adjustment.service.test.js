// tests/integration/adjustment.service.test.js
//
// Requires `npm install` first (jest + mongodb-memory-server) - see
// tests/integration/setup.js's header comment for why these weren't
// executed in the original sandbox and what to verify before trusting
// them. Run with: npm run test:integration
//
// Covers src/modules/adjustment/adjustment.service.js - the replacement
// for the original POST /api/v1/wallet/credit vulnerability (any
// authenticated user could mint balance with zero ledger trace). These
// tests exist specifically to prove that replacement is actually safe:
// ledgered, idempotent, and refuses to create money it can't account for.

const mongoose = require("mongoose");
const crypto = require("crypto");
const { setupTestDatabase, teardownTestDatabase, clearTestDatabase } = require("./setup");

process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.JWT_SECRET = "test";
process.env.ADMIN_KEY = "test";
process.env.ADMIN_JWT_SECRET = "test";

const Wallet = require("../../src/modules/wallet/wallet.model");
const LedgerEntry = require("../../src/modules/ledger/ledger.model");
const Adjustment = require("../../src/modules/adjustment/adjustment.model");
const { applyAdjustment } = require("../../src/modules/adjustment/adjustment.service");
const { computeBalance } = require("../../src/modules/ledger/ledger.service");

beforeAll(async () => {
    await setupTestDatabase();
}, 60000);

afterAll(async () => {
    await teardownTestDatabase();
});

afterEach(async () => {
    await clearTestDatabase();
});




    async function createTestWallet(balance = 0) {
    const wallet = await Wallet.create({
        accountNumber: `10${Math.floor(1000000 + Math.random() * 8999999)}`,
        balance
    });

    if (balance > 0) {
        await LedgerEntry.create({
            entryGroup: `test-initial-${wallet._id}`,
            wallet: wallet._id,
            direction: "credit",
            amount: balance,
            sourceType: "deposit",
            sourceRef: `test-initial-${wallet._id}`,
            description: "Test fixture initial funding"
        });
    }

    return wallet;
    }


describe("adjustment.service - credit", () => {
    test("credits the wallet and posts a matching ledger entry", async () => {
        const wallet = await createTestWallet(1000);

        const result = await applyAdjustment({
            accountNumber: wallet.accountNumber,
            direction: "credit",
            amount: 500,
            reference: "adj-test-1",
            reason: "goodwill credit for test",
            performedBy: "test-admin"
        });

        expect(result.duplicate).toBe(false);

        const updatedWallet = await Wallet.findById(wallet._id);
        expect(updatedWallet.balance).toBe(1500);

        // The whole point of this replacing /wallet/credit: balance
        // changes must be ledgered, not just a bare field mutation.
        const ledgerBalance = await computeBalance(wallet._id);
        expect(ledgerBalance).toBe(1500);

        const entries = await LedgerEntry.find({ wallet: wallet._id, sourceType: "adjustment" });
        expect(entries).toHaveLength(1);
        expect(entries[0].direction).toBe("credit");
        expect(entries[0].amount).toBe(500);
    });

    test("is idempotent on `reference` - a duplicate call returns the original, doesn't double-credit", async () => {
        const wallet = await createTestWallet(1000);
        const params = {
            accountNumber: wallet.accountNumber,
            direction: "credit",
            amount: 500,
            reference: "adj-test-idempotent",
            reason: "test",
            performedBy: "test-admin"
        };

        const first = await applyAdjustment(params);
        const second = await applyAdjustment(params);

        expect(first.duplicate).toBe(false);
        expect(second.duplicate).toBe(true);
        expect(second.adjustment._id.toString()).toBe(first.adjustment._id.toString());

        const updatedWallet = await Wallet.findById(wallet._id);
        expect(updatedWallet.balance).toBe(1500); // NOT 2000 - only credited once
    });

    test("rejects a missing/empty reason", async () => {
        const wallet = await createTestWallet(1000);
        await expect(applyAdjustment({
            accountNumber: wallet.accountNumber,
            direction: "credit",
            amount: 500,
            reference: "adj-test-no-reason",
            reason: "   ",
            performedBy: "test-admin"
        })).rejects.toThrow(/reason_required/);
    });

    test("rejects a non-integer amount", async () => {
        const wallet = await createTestWallet(1000);
        await expect(applyAdjustment({
            accountNumber: wallet.accountNumber,
            direction: "credit",
            amount: 500.5,
            reference: "adj-test-decimal",
            reason: "test",
            performedBy: "test-admin"
        })).rejects.toThrow(/invalid_adjustment_amount/);
    });
});

describe("adjustment.service - debit", () => {
    test("debits the wallet when sufficient balance exists", async () => {
        const wallet = await createTestWallet(1000);

        await applyAdjustment({
            accountNumber: wallet.accountNumber,
            direction: "debit",
            amount: 300,
            reference: "adj-test-debit-1",
            reason: "correcting an over-credit",
            performedBy: "test-admin"
        });

        const updatedWallet = await Wallet.findById(wallet._id);
        expect(updatedWallet.balance).toBe(700);
    });

    test("refuses to debit past zero, and does NOT create a negative-balance wallet", async () => {
        const wallet = await createTestWallet(100);

        await expect(applyAdjustment({
            accountNumber: wallet.accountNumber,
            direction: "debit",
            amount: 500,
            reference: "adj-test-overdraft",
            reason: "test",
            performedBy: "test-admin"
        })).rejects.toThrow(/insufficient_balance/);

        const unchangedWallet = await Wallet.findById(wallet._id);
        expect(unchangedWallet.balance).toBe(100); // untouched
    });
});

describe("adjustment.service - audit trail", () => {
    test("every adjustment is traceable to a specific admin via performedBy", async () => {
        const wallet = await createTestWallet(0);

        const result = await applyAdjustment({
            accountNumber: wallet.accountNumber,
            direction: "credit",
            amount: 100,
            reference: "adj-test-audit",
            reason: "test",
            performedBy: "alice"
        });

        const stored = await Adjustment.findById(result.adjustment._id);
        expect(stored.performedBy).toBe("alice");
        expect(stored.reason).toBe("test");
    });
});
