const router = require("express").Router();
const controller = require("./dispute.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { idParams, listQuery, updateBody } = require("./dispute.validation");

const READ_ROLES = ["ops", "compliance", "support", "superadmin"];
const WRITE_ROLES = ["ops", "compliance", "superadmin"];

router.get("/", requireAdminAuth(READ_ROLES), validate({ query: listQuery }), controller.listAll);
router.get("/:id", requireAdminAuth(READ_ROLES), validate({ params: idParams }), controller.getOne);
router.patch("/:id", requireAdminAuth(WRITE_ROLES), validate({ params: idParams, body: updateBody }), controller.update);

module.exports = router;
