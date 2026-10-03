// tests/integration/bankTransfer.test.js
//
// Customer "To Bank" transfers over HTTP, against the MOCK provider
// (BANK_PROVIDER unset). Uses the mock's documented dev triggers
// (providers/mockBankProvider.js): account numbers ending 0000 are
// rejected, 9999 are "unknown outcome", 1111 fail name enquiry.
// Requires `npm install`; run with: npm run test:integration

const request = require("supertest");
const crypto = require("crypto");

process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_KEY = "test";
process.env.ADMIN_JWT_SECRET = "test-admin-secret";
process.env.AUTH_RATE_LIMIT = "200";
process.env.LOOKUP_RATE_LIMIT = "500";

const { setupTestDatabase, teardownTestDatabase, clearTestDatabase } = require("./setup");
const app = require("../../src/app");
const Wallet = require("../../src/modules/wallet/wallet.model");
const User = require("../../src/modules/auth/user.model");
const LedgerEntry = require("../../src/modules/ledger/ledger.model");
const BankTransfer = require("../../src/modules/bankTransfer/bankTransfer.model");
const { FEE, FREE_PER_DAY } = require("../../src/config/bankTransfer");

beforeAll(async () => { await setupTestDatabase(); }, 60000);
afterAll(async () => { await teardownTestDatabase(); });
afterEach(async () => { await clearTestDatabase(); });

async function signedInUser(balance = 100000) {
    const n = crypto.randomInt(1e9);
    const user = { fullname: "Ada Test", email: `ada.${n}@example.com`, phone: `08${String(n).padStart(9, "0")}`, pin: "482916" };
    await request(app).post("/api/v1/auth/register").send(user);
    await User.updateOne({ phone: user.phone }, { kycTier: "tier2" }); // keep limits out of the way
    await Wallet.updateOne({ accountNumber: user.phone.slice(1) }, { balance });
    const login = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
    return { user, auth: { Authorization: `Bearer ${login.body.accessToken}` }, account: user.phone.slice(1) };
}
const balanceOf = async (account) => (await Wallet.findOne({ accountNumber: account })).balance;
let seq = 0;
const send = (auth, over = {}) => request(app).post("/api/v1/bank-transfers").set(auth).send({
    accountNumber: "0123456789", bankCode: "058", amount: 1000, description: "rent", pin: "482916",
    idempotencyKey: `test-key-${Date.now()}-${seq++}`, ...over
});

describe("customer bank transfers (mock provider)", () => {
    test("config, banks and name enquiry", async () => {
        const { auth } = await signedInUser();

        const cfg = await request(app).get("/api/v1/bank-transfers/config").set(auth);
        expect(cfg.body.data).toMatchObject({ provider: "mock", testMode: true, fee: FEE, freePerDay: FREE_PER_DAY, freeRemaining: FREE_PER_DAY });

        const banks = await request(app).get("/api/v1/bank-transfers/banks").set(auth);
        expect(banks.body.data.some((b) => b.code === "058")).toBe(true);

        const ok = await request(app).get("/api/v1/bank-transfers/name-enquiry?accountNumber=0123456789&bankCode=058").set(auth);
        expect(ok.status).toBe(200);
        expect(ok.body.data.accountName).toMatch(/0123456789/);

        const missing = await request(app).get("/api/v1/bank-transfers/name-enquiry?accountNumber=0123451111&bankCode=058").set(auth);
        expect(missing.status).toBe(404);

        const bad = await request(app).get("/api/v1/bank-transfers/name-enquiry?accountNumber=123&bankCode=058").set(auth);
        expect(bad.status).toBe(422);

        expect((await request(app).get("/api/v1/bank-transfers/banks")).status).toBe(401);
    });

    test("first 3 transfers each day are free, then the flat fee applies", async () => {
        const { auth, account } = await signedInUser(100000);

        for (let i = 0; i < FREE_PER_DAY; i++) {
            const r = await send(auth);
            expect(r.status).toBe(201);
            expect(r.body.data).toMatchObject({ status: "success", fee: 0, amount: 1000 });
        }
        expect(await balanceOf(account)).toBe(100000 - 1000 * FREE_PER_DAY);

        const paid = await send(auth);
        expect(paid.body.data.fee).toBe(FEE);
        expect(await balanceOf(account)).toBe(100000 - 1000 * (FREE_PER_DAY + 1) - FEE);

        const cfg = await request(app).get("/api/v1/bank-transfers/config").set(auth);
        expect(cfg.body.data.freeRemaining).toBe(0);

        // ledger agrees with the wallet: every naira debited has an entry
        const wallet = await Wallet.findOne({ accountNumber: account });
        const debits = await LedgerEntry.aggregate([
            { $match: { wallet: wallet._id, direction: "debit", sourceType: "payout" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        expect(debits[0].total).toBe(1000 * (FREE_PER_DAY + 1) + FEE);

        // and it shows up in the customer's history with the recipient + bank
        const history = await request(app).get("/api/v1/transaction?limit=10").set(auth);
        const row = history.body.data[0];
        expect(row).toMatchObject({ bank: "Guaranty Trust Bank", accountNumber: "0123456789", fee: FEE });
        expect(row.recipientName).toMatch(/0123456789/);
    });

    test("a bank rejection returns the customer's money in full, fee included", async () => {
        const { auth, account } = await signedInUser(10000);
        for (let i = 0; i < FREE_PER_DAY; i++) await send(auth);              // use up the free ones
        const before = await balanceOf(account);

        const r = await send(auth, { accountNumber: "0123450000", amount: 2000 }); // ...0000 => rejected
        expect(r.status).toBe(400);
        expect(r.body.data.status).toBe("failed");
        expect(await balanceOf(account)).toBe(before);

        const bt = await BankTransfer.findOne({ destinationAccountNumber: "0123450000" });
        expect(bt.status).toBe("failed");
        // a failed transfer must not burn one of the day's free transfers
        const cfg = await request(app).get("/api/v1/bank-transfers/config").set(auth);
        expect(cfg.body.data.freeRemaining).toBe(0);
        const reversalCredits = await LedgerEntry.find({ sourceType: "reversal", direction: "credit" });
        expect(reversalCredits.reduce((s, e) => s + e.amount, 0)).toBe(2000 + FEE);
    });

    test("an unknown provider outcome keeps the money debited and flags the transfer for review", async () => {
        const { auth, account } = await signedInUser(10000);

        const r = await send(auth, { accountNumber: "0123459999", amount: 3000 }); // ...9999 => ambiguous
        expect(r.status).toBe(201);
        expect(r.body.data.status).toBe("requires_review");
        expect(await balanceOf(account)).toBe(7000);                              // NOT refunded: it may have been sent
    });

    test("the same idempotency key never creates a second transfer", async () => {
        const { auth, account } = await signedInUser(10000);
        const key = "retry-me-12345678";

        const first = await send(auth, { idempotencyKey: key });
        const again = await send(auth, { idempotencyKey: key });

        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        expect(again.body.duplicate).toBe(true);
        expect(again.body.data.id).toBe(first.body.data.id);
        expect(await balanceOf(account)).toBe(9000);
        expect(await BankTransfer.countDocuments()).toBe(1);
    });

    test("rejects bad input and insufficient balance without touching the wallet", async () => {
        const { auth, account } = await signedInUser(500);

        expect((await send(auth, { amount: 50 })).status).toBe(400);                  // below the minimum
        expect((await send(auth, { amount: 100.5 })).status).toBe(422);               // not a whole naira amount
        expect((await send(auth, { accountNumber: "12345" })).status).toBe(422);
        expect((await send(auth, { bankCode: "999" })).status).toBe(400);             // unsupported bank
        expect((await send(auth, { accountNumber: "0123451111" })).status).toBe(400); // can't verify the account
        const broke = await send(auth, { amount: 1000 });
        expect(broke.status).toBe(400);
        expect(broke.body.message).toMatch(/insufficient/i);

        expect(await balanceOf(account)).toBe(500);
        expect(await BankTransfer.countDocuments()).toBe(0);
    });

    test("every transfer needs the right PIN; wrong PINs move no money and share the login lockout", async () => {
        const { user, auth, account } = await signedInUser(10000);

        const missing = await request(app).post("/api/v1/bank-transfers").set(auth)
            .send({ accountNumber: "0123456789", bankCode: "058", amount: 1000, idempotencyKey: "no-pin-12345678" });
        expect(missing.status).toBe(422);

        const wrong = await send(auth, { pin: "111222" });
        expect(wrong.status).toBe(400);
        expect(wrong.body.message).toMatch(/incorrect pin.*4 attempts left/i);
        expect(await balanceOf(account)).toBe(10000);
        expect(await BankTransfer.countDocuments()).toBe(0);

        // wallet-to-wallet transfers require it too
        const walletWrong = await request(app).post("/api/v1/transaction/transfer").set(auth)
            .send({ accountNumber: "1000000000", amount: 100, pin: "111222" });
        expect(walletWrong.status).toBe(400);
        expect(walletWrong.body.message).toMatch(/incorrect pin/i);

        // the correct PIN resets the counter
        expect((await send(auth)).status).toBe(201);
        const afterOk = await send(auth, { pin: "111222" });
        expect(afterOk.body.message).toMatch(/4 attempts left/i);

        // 4 more wrong PINs here lock the account everywhere, login included
        for (let i = 0; i < 4; i++) await send(auth, { pin: "111222" });
        const locked = await send(auth);
        expect(locked.status).toBe(400);
        expect(locked.body.message).toMatch(/too many/i);
        const login = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
        expect(login.status).toBe(400);
        expect(login.body.message).toMatch(/too many/i);
    });

    test("a transfer with no note (JSON null description/bank) is accepted", async () => {
        const { auth } = await signedInUser(10000);
        const r = await send(auth, { description: null });
        expect(r.status).toBe(201);
    });
});
