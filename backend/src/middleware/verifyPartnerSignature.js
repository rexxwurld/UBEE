// src/middleware/verifyPartnerSignature.js
//
// Generalizes the old verifySwiftpaySignature middleware (kept in place
// as a thin wrapper around this one - see that file) to any number of
// onboarded partners, each with their own secret (src/modules/partner/).
//
// The calling partner identifies itself via `linkedService` in the
// request body (the same field payout/refund instructions already
// carry - defaults to "swiftpay" if absent, matching
// refund.service.js's own existing default, so the original SwiftPay
// integration needs zero changes on the caller's side). This works
// because express.json() runs before any route middleware, so req.body
// is already parsed here - the signature itself is still verified over
// the exact same JSON.stringify(req.body) it always was, just checked
// against THAT partner's own secret instead of one shared secret
// checked against everyone.
//
// Accepts either the new x-partner-signature header or the legacy
// x-swiftpay-signature header (so an already-integrated SwiftPay
// doesn't need to change its header name to keep working).
//
// During a secret rotation grace window (see partner.service.js:
// rotateWebhookSecret), a signature verified against the partner's
// PREVIOUS secret is also accepted - this is what makes rotation a real
// overlap window instead of an instant, uncoordinated cutover.

const { verifySignature } = require("../utils/webhookSignature");
const { getPartnerBySlug } = require("../modules/partner/partner.service");

module.exports = async function verifyPartnerSignature(req, res, next) {
    try {
        const slug = (req.body && req.body.linkedService) || "swiftpay";
        const signature = req.headers["x-partner-signature"] || req.headers["x-swiftpay-signature"];

        const partner = await getPartnerBySlug(slug);
        if (!partner) {
            return res.status(401).json({ status: false, message: "unknown_partner" });
        }
        if (partner.status !== "active") {
            return res.status(403).json({ status: false, message: "partner_suspended" });
        }

        const validAgainstCurrent = verifySignature(req.body, signature, partner.webhookSecret);

        const rotationStillInGrace = partner.previousWebhookSecret &&
            partner.previousSecretExpiresAt &&
            partner.previousSecretExpiresAt.getTime() > Date.now();

        const validAgainstPrevious = rotationStillInGrace &&
            verifySignature(req.body, signature, partner.previousWebhookSecret);

        if (!validAgainstCurrent && !validAgainstPrevious) {
            return res.status(401).json({ status: false, message: "invalid_signature" });
        }

        req.partner = partner; // downstream handlers can use this instead of re-looking-up
        next();
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
