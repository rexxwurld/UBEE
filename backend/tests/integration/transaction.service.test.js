// tests/integration/transaction.service.test.js
//
// Requires `npm install` first - see tests/integration/setup.js's
// header comment. Run with: npm run test:integration
//
// Covers src/modules/transaction/transaction.service.js:transfer - the
// core internal wallet-to-wallet money movement. The central property
// under test is the double-entry invariant: every transfer's debit and
// credit ledger legs must net to exactly zero, and the two wallets'
// balance changes must be exact opposites - if this ever fails, money
// is being created or destroyed somewhere.

const crypto = require("crypto");
const { setupTestDatabase, teardownTestDatabase, clearTestDatabase } = require("./setup");

process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.JWT_SECRET = "test";
process.env.ADMIN_KEY = "test";
process.env.ADMIN_JWT_SECRET = "test";
process.env.SWIFTPAY_WEBHOOK_SECRET = "test";
process.env.SWIFTPAY_WEBHOOK_URL = "http://localhost:9999/webhook-not-actually-called";

const User = require("../../src/modules/auth/user.model");
const Wallet = require("../../src/modules/wallet/wallet.model");
const LedgerEntry = require("../../src/modules/ledger/ledger.model");
const { transfer } = require("../../src/modules/transaction/transaction.service");
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

async function createTestUserWithWallet(balance = 0, kycTier = "tier2") {
    const user = await User.create({
        fullname: "Test User",
        email: `test-${crypto.randomBytes(4).toString("hex")}@example.com`,
        phone: `080${Math.floor(10000000 + Math.random() * 89999999)}`,
        password: "irrelevant-for-these-tests",
        kycTier,
        bvnHash: crypto.randomBytes(32).toString("hex"),
        ninHash: crypto.randomBytes(32).toString("hex")
    });


    const wallet = await Wallet.create({
    userId: user._id,
    accountNumber: `10${Math.floor(1000000 + Math.random() * 8999999)}`,
    balance: 0
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
    return { user, wallet };
}

describe("transaction.service.transfer - double-entry invariant", () => {
    test("moves the exact amount between two wallets, with matching debit+credit ledger legs that net to zero", async () => {
        const { user: sender, wallet: senderWallet } = await createTestUserWithWallet(10000);
        const { wallet: receiverWallet } = await createTestUserWithWallet(0);

        const result = await transfer(
            sender._id,
            receiverWallet.accountNumber,
            3000,
            "test transfer",
            null,
            `idem-${crypto.randomBytes(4).toString("hex")}`
        );

        expect(result.duplicate).toBe(false);

        const updatedSender = await Wallet.findById(senderWallet._id);
        const updatedReceiver = await Wallet.findById(receiverWallet._id);

        expect(updatedSender.balance).toBe(7000);
        expect(updatedReceiver.balance).toBe(3000);

        // The core double-entry property: total balance across both
        // wallets is UNCHANGED by the transfer (10000 -> 7000 + 3000).
        expect(updatedSender.balance + updatedReceiver.balance).toBe(10000);

        // Ledger-derived balances must agree with the cached fields.
        expect(await computeBalance(senderWallet._id)).toBe(7000);
        expect(await computeBalance(receiverWallet._id)).toBe(3000);

        const entries = await LedgerEntry.find({ sourceType: "transfer" });
        expect(entries).toHaveLength(2);
        const debit = entries.find((e) => e.direction === "debit");
        const credit = entries.find((e) => e.direction === "credit");
        expect(debit.amount).toBe(credit.amount); // the two legs must be equal amounts
        expect(debit.wallet.toString()).toBe(senderWallet._id.toString());
        expect(credit.wallet.toString()).toBe(receiverWallet._id.toString());
    });

    test("is idempotent - a retried request with the same idempotencyKey does not move money twice", async () => {
        const { user: sender, wallet: senderWallet } = await createTestUserWithWallet(10000);
        const { wallet: receiverWallet } = await createTestUserWithWallet(0);
        const idempotencyKey = `idem-${crypto.randomBytes(4).toString("hex")}`;

        await transfer(sender._id, receiverWallet.accountNumber, 1000, "", null, idempotencyKey);
        const second = await transfer(sender._id, receiverWallet.accountNumber, 1000, "", null, idempotencyKey);

        expect(second.duplicate).toBe(true);

        const updatedSender = await Wallet.findById(senderWallet._id);
        expect(updatedSender.balance).toBe(9000); // debited once, not twice
    });

    test("rejects a transfer exceeding the sender's tier limit, and moves no money", async () => {
        const { user: sender, wallet: senderWallet } = await createTestUserWithWallet(10_000_000, "tier1");
        const { wallet: receiverWallet } = await createTestUserWithWallet(0);

        // tier1's default maxSingleTransfer is 50,000 (src/config/limits.js) -
        // this amount is deliberately far above that.
        await expect(
            transfer(sender._id, receiverWallet.accountNumber, 200000, "", null, `idem-${crypto.randomBytes(4).toString("hex")}`)
        ).rejects.toThrow(/exceeds the maximum single transfer limit/);

        const unchangedSender = await Wallet.findById(senderWallet._id);
        expect(unchangedSender.balance).toBe(10_000_000); // untouched
    });

    test("rejects a transfer from a frozen account", async () => {
        const { user: sender, wallet: senderWallet } = await createTestUserWithWallet(10000);
        const { wallet: receiverWallet } = await createTestUserWithWallet(0);

        sender.accountState = "frozen";
        await sender.save();

        await expect(
            transfer(sender._id, receiverWallet.accountNumber, 1000, "", null, `idem-${crypto.randomBytes(4).toString("hex")}`)
        ).rejects.toThrow(/account_not_active/);

        const unchangedSender = await Wallet.findById(senderWallet._id);
        expect(unchangedSender.balance).toBe(10000);
    });

    test("rejects sending to yourself", async () => {
        const { user: sender, wallet: senderWallet } = await createTestUserWithWallet(10000);

        await expect(
            transfer(sender._id, senderWallet.accountNumber, 1000, "", null, `idem-${crypto.randomBytes(4).toString("hex")}`)
        ).rejects.toThrow(/Cannot transfer to self/);
    });
});
