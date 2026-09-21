const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const requestId = require("./middleware/requestId");

const app = express();

// Required for express-rate-limit (and any other IP-based control) to
// see the REAL client IP rather than the reverse proxy's, when this app
// sits behind one (Render, a load balancer, etc). "1" trusts exactly one
// hop - adjust to match your actual deployment topology; trusting an
// arbitrary number of hops, or trusting proxies blindly, lets a client
// spoof X-Forwarded-For and evade rate limiting entirely.
if (process.env.TRUST_PROXY) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// CORRELATION IDs - runs before everything else so every subsequent
// piece of middleware, every route handler, and every audit log entry
// this request causes (even from deep inside a service function that
// never sees `req`, via src/utils/requestContext.js) can be tied back
// to one ID. See src/middleware/requestId.js.
app.use(requestId);

// SECURITY HEADERS - was entirely absent before (no CSP, no
// X-Content-Type-Options, etc). Defaults are sane for a JSON API; this
// app doesn't serve the kind of mixed third-party content that usually
// needs CSP customization, so no config beyond the defaults for now.
app.use(helmet());

// REQUEST LOGGING - morgan has been a dependency in package.json since
// before Phase 4 but was never actually wired in (the audit flagged
// this specifically: "even basic HTTP access logging isn't currently
// active despite being installed"). Custom token adds the correlation
// ID to every access-log line, so it can be grepped alongside the audit
// log entries that same request produced.
morgan.token("reqid", (req) => req.id);
const morganFormat = process.env.NODE_ENV === "production"
    ? ':reqid :remote-addr :method :url :status :res[content-length] - :response-time ms'
    : ':reqid :method :url :status :response-time ms';
app.use(morgan(morganFormat));

// CORE MIDDLEWARE
app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: "https://rexxpay.onrender.com",
    credentials: true
}));

// GLOBAL RATE LIMIT - a broad backstop on every route. Auth and admin
// routes layer stricter, more specific limiters on top of this (see
// auth.routes.js, and the admin-wide limiter below) - this one just
// catches generic API abuse that doesn't fit either of those buckets.
const { globalLimiter, adminLimiter } = require("./middleware/rateLimiters");
app.use(globalLimiter);

// DB-aware health check (previously returned 200 unconditionally, even
// with MongoDB fully disconnected - flagged in the original audit's
// §15). mongoose.connection.readyState: 0=disconnected, 1=connected,
// 2=connecting, 3=disconnecting. Only 1 is genuinely healthy - a load
// balancer/orchestrator should stop routing traffic here otherwise.
app.get("/health", (req, res) => {
    const mongoose = require("mongoose");
    const dbState = mongoose.connection.readyState;
    const dbConnected = dbState === 1;

    res.status(dbConnected ? 200 : 503).json({
        status: dbConnected,
        message: dbConnected ? "ok" : "database_not_connected",
        db: { readyState: dbState }
    });
});

const authRoutes = require("./modules/auth/auth.routes");
const mfaRoutes = require("./modules/mfa/mfa.routes");
const sessionRoutes = require("./modules/session/session.routes");
const deviceTokenRoutes = require("./modules/deviceToken/deviceToken.routes");
const walletRoutes = require("./modules/wallet/wallet.routes");
const transactionRoutes = require("./modules/transaction/transaction.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const depositRoutes = require("./modules/deposit/deposit.routes");
const payoutRoutes = require("./modules/payout/payout.routes");
const refundRoutes = require("./modules/refund/refund.routes");
const adjustmentRoutes = require("./modules/adjustment/adjustment.routes");
const kycRoutes = require("./modules/kyc/kyc.routes");
const kycAdminRoutes = require("./modules/kyc/kyc.admin.routes");
const accountStateRoutes = require("./modules/account/accountState.routes");
const disputeRoutes = require("./modules/dispute/dispute.routes");
const disputeAdminRoutes = require("./modules/dispute/dispute.admin.routes");
const { customerRouter: opsCustomerRoutes, transactionRouter: opsTransactionRoutes } = require("./modules/ops/ops.routes");
const partnerRoutes = require("./modules/partner/partner.routes");
const adminUserRoutes = require("./modules/adminUser/adminUser.routes");
const approvalRoutes = require("./modules/approval/approval.routes");
const bankRoutes = require("./modules/bank/bank.routes");
const bankWebhookRoutes = require("./providers/bankWebhook.routes");
const reconciliationRoutes = require("./modules/reconciliation/reconciliation.routes");
const ledgerAdminRoutes = require("./modules/ledger/ledger.admin.routes");
const mockBankRoutes = require("./modules/bankPartner/mockBank.routes");

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/auth/mfa", mfaRoutes);
app.use("/api/v1/auth/sessions", sessionRoutes);
app.use("/api/v1/notifications", deviceTokenRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/transaction", transactionRoutes);
app.use("/api/v1/kyc", kycRoutes);
app.use("/api/v1/payouts", payoutRoutes);
app.use("/api/v1/refunds", refundRoutes);
app.use("/api/v1/disputes", disputeRoutes);

// Real inbound landing point for a provider's deposit-notification
// webhooks (Phase 5 prep) - see src/providers/bankWebhook.routes.js.
// Not under the admin-key/JWT auth at all (a bank provider isn't an
// admin or a partner) - authentication here is each provider's own
// signature scheme, verified per-provider inside that route.
app.use("/api/v1/webhooks/bank", bankWebhookRoutes);

// Every /api/v1/admin/* route gets the admin-specific rate limiter on
// top of the global one - the admin surface is small and low-volume by
// nature, so a strict limit here costs nothing in real usability and
// meaningfully slows down anyone trying to brute-force an admin
// credential (real or legacy-shared-key). Mounted once here rather
// than per-router so no individual admin route file can forget it.
app.use("/api/v1/admin", adminLimiter);

app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin/deposits", depositRoutes);
app.use("/api/v1/admin/adjustments", adjustmentRoutes);
app.use("/api/v1/admin/kyc", kycAdminRoutes);
app.use("/api/v1/admin/accounts", accountStateRoutes);
app.use("/api/v1/admin/partners", partnerRoutes);
app.use("/api/v1/admin/auth", adminUserRoutes);
app.use("/api/v1/admin/approvals", approvalRoutes);
app.use("/api/v1/admin/reconciliation", reconciliationRoutes);
app.use("/api/v1/admin/wallets", ledgerAdminRoutes);
app.use("/api/v1/admin/disputes", disputeAdminRoutes);
app.use("/api/v1/admin/customers", opsCustomerRoutes);
app.use("/api/v1/admin/transactions", opsTransactionRoutes);
app.use("/api/v1/banks", bankRoutes);

// DEVELOPMENT/TESTING ONLY - simulates a bank transfer landing in RexxPay
// while there's no real NIBSS connection. Never expose this in production.
if (process.env.NODE_ENV !== "production") {
    app.use("/api/v1/mock-bank", mockBankRoutes);
}

// The static web frontend (src/public/ - index.html, dashboard, etc.) has
// been removed now that UBee (the MAUI mobile app) is the client. There is
// no browser UI to fall back to anymore, so an unmatched route is just a
// 404, not an attempt to sendFile a page that no longer exists.
app.use((req, res) => {
    res.status(404).json({ status: false, message: "not_found" });
});


module.exports = app;
