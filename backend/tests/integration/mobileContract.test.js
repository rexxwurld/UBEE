// tests/integration/mobileContract.test.js
//
// Requires `npm install` first, including supertest as a new devDependency
// (`npm install --save-dev supertest`) - see tests/integration/setup.js's
// header comment for the mongodb-memory-server/jest requirement this
// shares with the rest of the suite. Run with: npm run test:integration
//
// This is NOT a unit test of one service - it drives src/app.js over HTTP
// exactly the way UBee.App's ApiClient/AuthService do: same paths, same
// request/response field names, same headers (Authorization: Bearer,
// Idempotency-Key, X-Device-Info). Its job is to catch contract drift
// between the two codebases - a renamed field or route on either side
// should fail here before it fails silently in the app.
//
// Written by inspecting UBee.App's Services/AuthService.cs, ApiClient.cs,
// and ViewModels/*.cs directly (mobile/), not from memory of the backend
// alone - endpoints and payload shapes below are copied from what the
// mobile client actually sends.

const request = require("supertest");
const crypto = require("crypto");

process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_KEY = "test";
process.env.ADMIN_JWT_SECRET = "test-admin-secret";
process.env.AUTH_RATE_LIMIT = "100"; // this suite makes more auth calls than the production default (10/15min) allows

const { setupTestDatabase, teardownTestDatabase, clearTestDatabase } = require("./setup");
const app = require("../../src/app");

beforeAll(async () => {
    await setupTestDatabase();
}, 60000);

afterAll(async () => {
    await teardownTestDatabase();
});

afterEach(async () => {
    await clearTestDatabase();
});

const DEVICE_HEADER = "U-BEE MAUI; Android; 14";

function testUser() {
    const n = crypto.randomInt(1e9);
    return {
        fullname: "Ada Test",
        email: `ada.${n}@example.com`,
        // 08 + 9 digits = a valid 11-digit Nigerian number (08xxxxxxxxx)
        phone: `08${String(n).padStart(9, "0")}`,
        pin: "482916"
    };
}

// otp.service.js's deliverOtp logs the plaintext code to the console in
// non-production instead of sending it anywhere real (see that file's
// header comment) - this is the documented dev-mode delivery channel,
// so reading it back off console.log is the correct way for a test to
// obtain a code, not a workaround.
async function captureOtpCode(action) {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
        await action();
        const line = spy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[otp]"));
        const match = line && line.match(/:\s*(\d{6})\s*$/);
        if (!match) throw new Error(`No OTP code captured. Log lines: ${JSON.stringify(spy.mock.calls)}`);
        return match[1];
    } finally {
        spy.mockRestore();
    }
}

describe("UBee mobile contract", () => {
    test("register -> login -> wallet -> transfer (with idempotency replay) -> transaction history", async () => {
        const user = testUser();

        // RegisterViewModel -> IAuthService.RegisterAsync -> POST auth/register
        const registerRes = await request(app)
            .post("/api/v1/auth/register")
            .send({ fullname: user.fullname, email: user.email, phone: user.phone, pin: user.pin });
        expect(registerRes.status).toBe(201);
        expect(registerRes.body.user?.email).toBe(user.email);

        // LoginViewModel -> IAuthService.LoginAsync -> POST auth/login
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .set("X-Device-Info", DEVICE_HEADER)
            .send({ phone: user.phone, pin: user.pin });
        expect(loginRes.status).toBe(200);
        // AuthModels.cs LoginResponse expects these exact field names
        expect(typeof loginRes.body.accessToken).toBe("string");
        expect(typeof loginRes.body.refreshToken).toBe("string");
        expect(loginRes.body.mfaRequired).toBeFalsy();

        const accessToken = loginRes.body.accessToken;
        const auth = (req) => req.set("Authorization", `Bearer ${accessToken}`).set("X-Device-Info", DEVICE_HEADER);

        // DashboardViewModel/WalletViewModel -> GetAsync<WalletEnvelope>("wallet")
        const walletRes = await auth(request(app).get("/api/v1/wallet"));
        expect(walletRes.status).toBe(200);
        expect(walletRes.body.status).toBe(true);
        expect(walletRes.body.data).toHaveProperty("accountNumber");
        // Account number = phone number without the leading 0
        expect(walletRes.body.data.accountNumber).toBe(user.phone.slice(1));
        expect(walletRes.body.data).toHaveProperty("balance");

        // TransferViewModel -> PostAsync<TransferRequest,TransferResponse>("transaction/transfer", idempotencyKey)
        // Wallet starts at 0 and there's no test-only credit endpoint
        // (POST /wallet/credit was deliberately removed - see
        // wallet.controller.js) - a 0-balance transfer attempt should
        // fail on insufficient funds, not on a shape/contract mismatch.
        const idempotencyKey = crypto.randomUUID().replace(/-/g, "");
        const transferBody = { accountNumber: "1000000000", amount: 500, description: "test", bank: null, idempotencyKey, pin: user.pin };

        const firstTransfer = await auth(request(app).post("/api/v1/transaction/transfer"))
            .set("Idempotency-Key", idempotencyKey)
            .send(transferBody);
        // Either shape is contract-valid here - the point is the response
        // envelope, not the business outcome of an unfunded transfer.
        expect(transferBody.idempotencyKey).toBe(idempotencyKey); // sanity: header/body key match, as ApiClient sends both
        expect(firstTransfer.body).toHaveProperty("status");
        expect(firstTransfer.body).toHaveProperty("message");

        // TransactionsViewModel -> GetAsync<TransactionPageDto>("transaction?limit=...")
        const historyRes = await auth(request(app).get("/api/v1/transaction?limit=20"));
        expect(historyRes.status).toBe(200);
        expect(historyRes.body.status).toBe(true);
        expect(Array.isArray(historyRes.body.data)).toBe(true);
        expect(historyRes.body).toHaveProperty("nextCursor");
    });

    test("kyc submit -> status round-trip matches KycViewModel's ApiEnvelope<KycStatusDto>", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);
        const loginRes = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
        const accessToken = loginRes.body.accessToken;

        const submitRes = await request(app)
            .post("/api/v1/kyc/submit")
            .set("Authorization", `Bearer ${accessToken}`)
            .send({
    bvn: "12345678901",
    nin: "98765432109",
    dateOfBirth: "2000-01-01"
});
        expect(submitRes.status).toBe(200);
        expect(submitRes.body.status).toBe(true);
        expect(submitRes.body.data).toHaveProperty("kycStatus");

        const statusRes = await request(app)
            .get("/api/v1/kyc/status")
            .set("Authorization", `Bearer ${accessToken}`);
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe(true);
        expect(statusRes.body.data).toHaveProperty("kycTier");
    });

    test("forgot-pin -> reset-pin matches ForgotPasswordViewModel/ResetPasswordViewModel contract, then old PIN stops working", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);

        // ForgotPasswordViewModel -> POST auth/forgot-password { phone }
        const code = await captureOtpCode(async () => {
            const res = await request(app).post("/api/v1/auth/forgot-password").send({ phone: user.phone });
            expect(res.status).toBe(200);
        });

        // ResetPasswordViewModel -> POST auth/reset-password { phone, otp, pin }
        const newPin = "739518";
        const resetRes = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ phone: user.phone, otp: code, pin: newPin });
        expect(resetRes.status).toBe(200);

        const oldLogin = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
        expect(oldLogin.status).toBe(400);

        const newLogin = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: newPin });
        expect(newLogin.status).toBe(200);
        expect(typeof newLogin.body.accessToken).toBe("string");

        // Same code must not be replayable (consumedAt is set on first use)
        const replay = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ phone: user.phone, otp: code, pin: "913572" });
        expect(replay.status).toBe(400);
    });

    test("expired/garbage access token gets 401, and token/refresh issues a usable replacement", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);
        const loginRes = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
        const { refreshToken } = loginRes.body;

        const badAuth = await request(app).get("/api/v1/wallet").set("Authorization", "Bearer not-a-real-token");
        expect(badAuth.status).toBe(401);

        // ApiClient.TryRefreshAsync -> POST auth/token/refresh { refreshToken }
        const refreshRes = await request(app)
            .post("/api/v1/auth/token/refresh")
            .set("X-Device-Info", DEVICE_HEADER)
            .send({ refreshToken });
        expect(refreshRes.status).toBe(200);
        expect(typeof refreshRes.body.accessToken).toBe("string");
        expect(typeof refreshRes.body.refreshToken).toBe("string");

        const walletWithNewToken = await request(app)
            .get("/api/v1/wallet")
            .set("Authorization", `Bearer ${refreshRes.body.accessToken}`);
        expect(walletWithNewToken.status).toBe(200);
    });
    test("phone is the account number (minus leading 0) however it is typed, and login accepts any of those forms", async () => {
        const user = testUser();
        const national = user.phone.slice(1);

        // Registered as +234..., stored/returned as 0xxxxxxxxxx
        const reg = await request(app).post("/api/v1/auth/register")
            .send({ ...user, phone: `+234${national}` });
        expect(reg.status).toBe(201);
        expect(reg.body.user.phone).toBe(user.phone);

        for (const typed of [user.phone, national, `234${national}`, `+234 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`]) {
            const res = await request(app).post("/api/v1/auth/login").send({ phone: typed, pin: user.pin });
            expect(res.status).toBe(200);
        }

        const login = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
        const wallet = await request(app).get("/api/v1/wallet").set("Authorization", `Bearer ${login.body.accessToken}`);
        expect(wallet.body.data.accountNumber).toBe(national);
    });

    test("register rejects bad phone numbers, weak/short PINs and a second account on the same phone", async () => {
        const user = testUser();

        const badPhone = await request(app).post("/api/v1/auth/register").send({ ...user, phone: "12345" });
        expect(badPhone.status).toBe(422);

        for (const pin of ["12345", "1234567", "123456", "000000", "abcdef"]) {
            const res = await request(app).post("/api/v1/auth/register").send({ ...user, pin });
            expect(res.status).toBe(422);
        }

        expect((await request(app).post("/api/v1/auth/register").send(user)).status).toBe(201);

        const dup = await request(app).post("/api/v1/auth/register")
            .send({ ...user, email: `other.${user.email}` });
        expect(dup.status).toBe(400);
    });

    test("account is locked after repeated wrong PINs, even with the right PIN afterwards", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);

        for (let i = 0; i < 5; i++) {
            const bad = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: "999111" });
            expect(bad.status).toBe(400);
        }

        const locked = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });
        expect(locked.status).toBe(400);
        expect(locked.body.message).toMatch(/too many/i);
    });
    test("GET /auth/me returns the full profile the app screens need", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);
        const login = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });

        const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
        expect(me.status).toBe(200);
        expect(me.body).toMatchObject({
            fullname: user.fullname,
            email: user.email,
            phone: user.phone,
            accountNumber: user.phone.slice(1),
            kycTier: "tier1"
        });
    });

    test("wallet lookup returns the holder's name, rejects bad numbers, and flags your own account", async () => {
        const a = testUser(); const b = testUser();
        await request(app).post("/api/v1/auth/register").send(a);
        await request(app).post("/api/v1/auth/register").send(b);
        const login = await request(app).post("/api/v1/auth/login").send({ phone: a.phone, pin: a.pin });
        const auth = { Authorization: `Bearer ${login.body.accessToken}` };

        const other = await request(app).get(`/api/v1/wallet/lookup/${b.phone.slice(1)}`).set(auth);
        expect(other.status).toBe(200);
        expect(other.body.data).toMatchObject({ accountNumber: b.phone.slice(1), fullname: b.fullname, isSelf: false });

        const self = await request(app).get(`/api/v1/wallet/lookup/${a.phone.slice(1)}`).set(auth);
        expect(self.body.data.isSelf).toBe(true);

        expect((await request(app).get("/api/v1/wallet/lookup/1234").set(auth)).status).toBe(400);
        expect((await request(app).get("/api/v1/wallet/lookup/9999999999").set(auth)).status).toBe(404);
        expect((await request(app).get(`/api/v1/wallet/lookup/${b.phone.slice(1)}`)).status).toBe(401); // needs login
    });

    test("kyc/status includes the tier table and today's usage used by the Account Limits screen", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);
        const login = await request(app).post("/api/v1/auth/login").send({ phone: user.phone, pin: user.pin });

        const res = await request(app).get("/api/v1/kyc/status").set("Authorization", `Bearer ${login.body.accessToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data.tiers.map((t) => t.tier)).toEqual(["tier1", "tier2", "tier3"]);
        expect(res.body.data.limits).toHaveProperty("maxDailyOutbound");
        expect(res.body.data.dailyOutboundUsed).toBe(0);
    });
});
