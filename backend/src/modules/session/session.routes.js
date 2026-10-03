const router = require("express").Router();
const controller = require("./session.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { sessionIdParams } = require("./session.validation");

router.get("/", auth, controller.listSessions);
router.post("/revoke-all", auth, controller.revokeAllSessions);
router.delete("/:sessionId", auth, validate({ params: sessionIdParams }), controller.revokeSession);

module.exports = router;
