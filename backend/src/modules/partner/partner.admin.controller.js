const partnerService = require("./partner.service");

// POST /api/v1/admin/partners
// Body: { name, slug, webhookUrl, webhookSecret?, contactEmail?, notes?, performedBy? }
exports.create = async (req, res) => {
    try {
        const { name, slug, webhookUrl, webhookSecret, contactEmail, notes, performedBy } = req.body;
        const partner = await partnerService.createPartner({
            name, slug, webhookUrl, webhookSecret, contactEmail, notes, performedBy
        });
        // webhookSecret shown here ONCE - see partner.service.js's comment.
        res.status(201).json({
            status: true,
            data: {
                id: partner._id,
                name: partner.name,
                slug: partner.slug,
                webhookUrl: partner.webhookUrl,
                webhookSecret: partner.webhookSecret,
                status: partner.status
            },
            note: "webhookSecret is shown once here - it will not be returned by GET /partners. Store it now."
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/partners
exports.list = async (req, res) => {
    try {
        const partners = await partnerService.listPartners();
        res.json({ status: true, count: partners.length, data: partners });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/partners/:slug/suspend
exports.suspend = async (req, res) => {
    try {
        const partner = await partnerService.setPartnerStatus(req.params.slug, "suspended", {
            performedBy: req.body.performedBy,
            reason: req.body.reason
        });
        res.json({ status: true, data: { slug: partner.slug, status: partner.status } });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/partners/:slug/activate
exports.activate = async (req, res) => {
    try {
        const partner = await partnerService.setPartnerStatus(req.params.slug, "active", {
            performedBy: req.body.performedBy,
            reason: req.body.reason
        });
        res.json({ status: true, data: { slug: partner.slug, status: partner.status } });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/partners/:slug/rotate-secret
// Body: { newSecret?, performedBy? }
exports.rotateSecret = async (req, res) => {
    try {
        const partner = await partnerService.rotateWebhookSecret(req.params.slug, {
            newSecret: req.body.newSecret,
            performedBy: req.body.performedBy
        });
        res.json({
            status: true,
            data: {
                slug: partner.slug,
                webhookSecret: partner.webhookSecret,
                previousSecretExpiresAt: partner.previousSecretExpiresAt
            },
            note: "New webhookSecret is shown once here. The previous secret keeps working for inbound verification until previousSecretExpiresAt."
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/partners/:slug/pool-health
exports.poolHealth = async (req, res) => {
    try {
        const health = await partnerService.getPartnerPoolHealth(req.params.slug);
        res.json({ status: true, data: health });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
