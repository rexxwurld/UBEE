// src/middleware/verifySwiftpaySignature.js
//
// DEPRECATED name, kept only so nothing importing this specific path
// breaks. The real logic now lives in verifyPartnerSignature.js, which
// generalizes this same check to any onboarded partner, not just
// SwiftPay - see that file's comment for what changed and why.
//
// New code should require verifyPartnerSignature directly.

module.exports = require("./verifyPartnerSignature");
