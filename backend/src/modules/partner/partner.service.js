// src/modules/partner/partner.service.js
const crypto = require("crypto");
const Partner = require("./partner.model");
const Wallet = require("../wallet/wallet.model");
const { getPoolByService } = require("../settlement/settlementPool.service");
const auditLog = require("../audit/auditLog.service");

const ROTATION_GRACE_MS = Number(process.env.PARTNER_SECRET_ROTATION_GRACE_MS || 24 * 60 * 60 * 1000); // 24h default

function generateSecret() {
    return crypto.randomBytes(48).toString("hex");
}

// Onboard a new partner. If webhookSecret isn't supplied, one is
// generated - returned ONCE in the response, same principle as an API
// key: the caller must capture it now, it isn't retrievable later
// (only rotatable).
async function createPartner({ name, slug, webhookUrl, webhookSecret, contactEmail, notes, performedBy = null }) {
    if (!name || !slug || !webhookUrl) throw new Error("name_slug_and_webhookUrl_required");

    const secret = webhookSecret || generateSecret();

    let partner;
    try {
        partner = await Partner.create({
            name, slug: slug.toLowerCase().trim(), webhookUrl, webhookSecret: secret, contactEmail, notes
        });
    } catch (err) {
        if (err.code === 11000) throw new Error("partner_slug_already_exists");
        throw err;
    }

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "partner.created",
        entityType: "Partner",
        entityRef: partner._id.toString(),
        severity: "warning",
        metadata: { name, slug: partner.slug }
    });

    // webhookSecret is intentionally included in THIS return value only -
    // the one moment the caller needs to capture it. Every other read
    // path (listPartners, getPartnerBySlug used by request-handling code)
    // should avoid echoing it back over an API response outside this
    // admin-onboarding flow.
    return partner;
}

async function listPartners() {
    return Partner.find().select("-webhookSecret -previousWebhookSecret").sort({ createdAt: 1 });
}

async function getPartnerBySlug(slug) {
    return Partner.findOne({ slug: String(slug).toLowerCase().trim() });
}

// Used internally (deposit/webhook/payout/refund flows) wherever the old
// code assumed "linkedService === 'swiftpay' is always valid". Throws
// clearly if the partner doesn't exist or is suspended, instead of
// letting a stale/typo'd slug silently fall through.
async function assertPartnerActive(slug) {
    const partner = await getPartnerBySlug(slug);
    if (!partner) throw new Error(`unknown_partner: ${slug}`);
    if (partner.status !== "active") throw new Error(`partner_suspended: ${slug}`);
    return partner;
}

async function setPartnerStatus(slug, status, { performedBy = null, reason = null } = {}) {
    if (!["active", "suspended"].includes(status)) throw new Error("invalid_partner_status");

    const partner = await getPartnerBySlug(slug);
    if (!partner) throw new Error("partner_not_found");

    partner.status = status;
    await partner.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: `partner.${status}`,
        entityType: "Partner",
        entityRef: partner._id.toString(),
        severity: "critical",
        metadata: { slug, reason }
    });

    return partner;
}

// Rotates a partner's webhook secret. The OLD secret keeps working for
// inbound signature verification for ROTATION_GRACE_MS, so the partner
// has a real overlap window to switch over on their side instead of an
// instant, uncoordinated cutover.
async function rotateWebhookSecret(slug, { newSecret, performedBy = null } = {}) {
    const partner = await getPartnerBySlug(slug);
    if (!partner) throw new Error("partner_not_found");

    partner.previousWebhookSecret = partner.webhookSecret;
    partner.previousSecretExpiresAt = new Date(Date.now() + ROTATION_GRACE_MS);
    partner.webhookSecret = newSecret || generateSecret();
    await partner.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "partner.secret_rotated",
        entityType: "Partner",
        entityRef: partner._id.toString(),
        severity: "critical",
        metadata: { slug, graceExpiresAt: partner.previousSecretExpiresAt }
    });

    // Same one-time-visibility principle as createPartner.
    return partner;
}

// Generalized version of admin.service.js's old, SwiftPay-hardcoded
// getPoolStatus - same comparison (wallet balances vs pool balance),
// but for any partner slug.
async function getPartnerPoolHealth(slug) {
    const partner = await getPartnerBySlug(slug);
    if (!partner) throw new Error("partner_not_found");

    const pool = await getPoolByService(slug);
    if (!pool) return { partner: sanitize(partner), pool: null, message: "no_settlement_pool_provisioned_yet" };

    const wallets = await Wallet.find({ pool: pool._id });
    const walletBalanceSum = wallets.reduce((sum, w) => sum + w.balance, 0);

    return {
        partner: sanitize(partner),
        pool,
        walletCount: wallets.length,
        walletBalanceSum,
        inSync: walletBalanceSum <= pool.poolBalance
    };
}

function sanitize(partner) {
    return {
        id: partner._id,
        name: partner.name,
        slug: partner.slug,
        status: partner.status,
        webhookUrl: partner.webhookUrl,
        contactEmail: partner.contactEmail,
        createdAt: partner.createdAt
    };
}

// Startup helper: if no Partner row exists yet for the given slug, seed
// one from the legacy global env vars (SWIFTPAY_WEBHOOK_URL /
// SWIFTPAY_WEBHOOK_SECRET). This is what lets an existing deployment
// upgrade to the multi-partner model transparently - the SwiftPay
// integration keeps working exactly as before, now backed by a real
// Partner record instead of hardcoded env/enum values. See server.js.
async function ensurePartnerFromEnv({ slug, name, webhookUrl, webhookSecret }) {
    if (!webhookUrl || !webhookSecret) return null; // nothing configured to seed from

    const existing = await getPartnerBySlug(slug);
    if (existing) return existing;

    return Partner.create({ name, slug, webhookUrl, webhookSecret });
}

module.exports = {
    createPartner,
    listPartners,
    getPartnerBySlug,
    assertPartnerActive,
    setPartnerStatus,
    rotateWebhookSecret,
    getPartnerPoolHealth,
    ensurePartnerFromEnv
};
