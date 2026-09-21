// src/utils/webhookSignature.js
//
// Signs outgoing webhooks to a partner (SwiftPay, or any other
// onboarded platform) so they can verify it really came from this
// bank, AND verifies incoming requests from a partner (e.g. payout
// instructions). Must use the exact same algorithm (HMAC-SHA512, hex
// digest) and the exact same secret on both sides.
//
// GENERALIZED (Phase 3a - multi-partner model): this used to hardcode
// SWIFTPAY_WEBHOOK_SECRET as the only secret it would ever sign/verify
// with. Now the secret is an explicit parameter - each partner has its
// own (see src/modules/partner/), so one partner's secret can never be
// used to forge a request as another. The SWIFTPAY_WEBHOOK_SECRET env
// var is kept ONLY as a fallback default for any call site not yet
// passing an explicit secret, so nothing silently breaks mid-migration -
// every call site in this codebase has been updated to pass a real
// per-partner secret explicitly (see deposit.service.js,
// transaction.service.js, middleware/verifyPartnerSignature.js).

const crypto = require("crypto");
const { SWIFTPAY_WEBHOOK_SECRET } = require("../config/env");

function signPayload(payload, secret = SWIFTPAY_WEBHOOK_SECRET) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

// Verifies a signature a partner sent us (e.g. on a payout instruction).
// Same algorithm as signPayload, just checked the other direction.
// Uses timingSafeEqual so response time can't leak how much of the
// signature matched.
function verifySignature(payload, signature, secret = SWIFTPAY_WEBHOOK_SECRET) {
    if (!signature) return false;
    const expected = signPayload(payload, secret);

    const expectedBuf = Buffer.from(expected, "hex");
    const givenBuf = Buffer.from(String(signature), "hex");

    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

module.exports = { signPayload, verifySignature };
