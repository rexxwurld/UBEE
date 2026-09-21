// src/middleware/rateLimiters.js
//
// The audit flagged this as completely absent: "Login, register, and
// the (critical) /wallet/credit endpoint can all be hit at unlimited
// request rates." No rate limiting existed anywhere in the codebase.
//
// Three tiers, from loosest to tightest:
//   globalLimiter - a broad backstop on every route, catches generic
//     API abuse/scraping that doesn't fit a more specific bucket.
//   authLimiter - tight, IP-based limit on login/register specifically,
//     the classic brute-force/credential-stuffing/account-enumeration
//     surface.
//   adminLimiter - tight limit on every /admin/* route. The admin
//     surface is small and low-volume by nature (real operators, not
//     high-throughput traffic), so a strict limit here costs nothing in
//     legitimate usability and meaningfully slows down anyone trying to
//     brute-force the admin key or a stolen admin credential.
//
// NOTE: keyed by IP (express-rate-limit's default). Behind a load
// balancer/reverse proxy, this requires `app.set('trust proxy', ...)`
// to be configured correctly (see app.js) or every request will appear
// to come from the proxy's IP and the limiter will be far too
// permissive in effect. Confirm your proxy/CDN sets X-Forwarded-For
// correctly before relying on this in production.

const rateLimit = require("express-rate-limit");

const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.GLOBAL_RATE_LIMIT || 120), // per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: "too_many_requests" }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 10), // per IP per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: "too_many_login_attempts_try_again_later" }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.ADMIN_RATE_LIMIT || 30), // per IP per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: "too_many_admin_requests_try_again_later" }
});

module.exports = { globalLimiter, authLimiter, adminLimiter };
