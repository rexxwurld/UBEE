const router = require("express").Router();
const controller = require("./dispute.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { raiseBody, referenceParams } = require("./dispute.validation");

router.post("/", auth, validate({ body: raiseBody }), controller.raise);
router.get("/", auth, controller.listMine);
router.get("/:reference", auth, validate({ params: referenceParams }), controller.getMine);

module.exports = router;
