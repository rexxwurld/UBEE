const router = require("express").Router();
const controller = require("./partner.admin.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { createPartnerBody, slugParams, statusChangeBody, rotateSecretBody } = require("./partner.validation");

// Partner onboarding/secret rotation is a large-blast-radius action -
// a compromised "ops" credential should NOT be able to onboard a rogue
// partner or rotate an existing partner's secret. Superadmin only.
router.post("/", requireAdminAuth(["superadmin"]), validate({ body: createPartnerBody }), controller.create);
router.get("/", requireAdminAuth(["superadmin", "ops", "support"]), controller.list);
router.patch(
    "/:slug/suspend",
    requireAdminAuth(["superadmin"]),
    validate({ params: slugParams, body: statusChangeBody }),
    controller.suspend
);
router.patch(
    "/:slug/activate",
    requireAdminAuth(["superadmin"]),
    validate({ params: slugParams, body: statusChangeBody }),
    controller.activate
);
router.post(
    "/:slug/rotate-secret",
    requireAdminAuth(["superadmin"]),
    validate({ params: slugParams, body: rotateSecretBody }),
    controller.rotateSecret
);
router.get(
    "/:slug/pool-health",
    requireAdminAuth(["superadmin", "ops", "support"]),
    validate({ params: slugParams }),
    controller.poolHealth
);

module.exports = router;
