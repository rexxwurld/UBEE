const router = require("express").Router();
const controller = require("./adjustment.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { createAdjustmentBody } = require("./adjustment.validation");

// POST /api/v1/admin/adjustments
// Ops-level, since it's a routine (if sensitive) money operation - see
// src/modules/approval/ for the maker-checker layer that sits in front
// of this for the highest-risk case (direct balance adjustments).
router.post("/", requireAdminAuth(["ops"]), validate({ body: createAdjustmentBody }), controller.createAdjustment);

module.exports = router;
