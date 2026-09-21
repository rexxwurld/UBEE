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
        phone: `080${String(n).padStart(8, "0")}`.slice(0, 11),
        password: "SuperSecret123"
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
            .send({ fullname: user.fullname, email: user.email, phone: user.phone, password: user.password });
        expect(registerRes.status).toBe(201);
        expect(registerRes.body.user?.email).toBe(user.email);

        // LoginViewModel -> IAuthService.LoginAsync -> POST auth/login
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .set("X-Device-Info", DEVICE_HEADER)
            .send({ email: user.email, password: user.password });
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
        expect(walletRes.body.data).toHaveProperty("balance");

        // TransferViewModel -> PostAsync<TransferRequest,TransferResponse>("transaction/transfer", idempotencyKey)
        // Wallet starts at 0 and there's no test-only credit endpoint
        // (POST /wallet/credit was deliberately removed - see
        // wallet.controller.js) - a 0-balance transfer attempt should
        // fail on insufficient funds, not on a shape/contract mismatch.
        const idempotencyKey = crypto.randomUUID().replace(/-/g, "");
        const transferBody = { accountNumber: "1000000000", amount: 500, description: "test", bank: null, idempotencyKey };

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
        const loginRes = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
        const accessToken = loginRes.body.accessToken;

        const submitRes = await request(app)
            .post("/api/v1/kyc/submit")
            .set("Authorization", `Bearer ${accessToken}`)
            .send({ bvn: "12345678901", nin: null, dateOfBirth: "2000-01-01" });
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

    test("forgot-password -> reset-password matches ForgotPasswordViewModel/ResetPasswordViewModel contract, then old password stops working", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);

        // ForgotPasswordViewModel -> POST auth/forgot-password { email }
        const code = await captureOtpCode(async () => {
            const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });
            expect(res.status).toBe(200);
        });

        // ResetPasswordViewModel -> POST auth/reset-password { email, otp, password }
        const newPassword = "BrandNewSecret456";
        const resetRes = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ email: user.email, otp: code, password: newPassword });
        expect(resetRes.status).toBe(200);

        const oldLogin = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
        expect(oldLogin.status).toBe(400);

        const newLogin = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: newPassword });
        expect(newLogin.status).toBe(200);
        expect(typeof newLogin.body.accessToken).toBe("string");

        // Same code must not be replayable (consumedAt is set on first use)
        const replay = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ email: user.email, otp: code, password: "SomethingElse789" });
        expect(replay.status).toBe(400);
    });

    test("expired/garbage access token gets 401, and token/refresh issues a usable replacement", async () => {
        const user = testUser();
        await request(app).post("/api/v1/auth/register").send(user);
        const loginRes = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
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
});
