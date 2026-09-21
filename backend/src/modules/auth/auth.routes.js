const router = require("express").Router();
const controller = require("./auth.controller");
const auth = require("../../middleware/auth");
const { authLimiter } = require("../../middleware/rateLimiters");
const validate = require("../../middleware/validate");
const { registerBody, loginBody, mfaVerifyBody, refreshTokenBody, logoutBody, forgotPasswordBody, resetPasswordBody } = require("./auth.validation");

router.get("/me", auth, (req, res) => {
    res.json(req.user);
});
// Tight, IP-based rate limit specifically on register/login - the
// classic brute-force/credential-stuffing/account-enumeration surface
// the audit flagged as completely unprotected. Not applied to /me or
// /logout, which legitimate clients may call far more often than 10
// times per 15 minutes just to check session state.
router.post("/register", authLimiter, validate({ body: registerBody }), controller.register);
router.post("/login", authLimiter, validate({ body: loginBody }), controller.login);
// Completes a login that returned { mfaRequired: true } - same limiter
// as login itself, since this is still part of the login brute-force
// surface (guessing OTP codes against a valid challengeId).
router.post("/login/mfa-verify", authLimiter, validate({ body: mfaVerifyBody }), controller.loginMfaVerify);

// PHASE 10: bearer/refresh-token flow for mobile (MAUI) clients, which
// don't have a browser cookie jar - see auth.controller.js's comments.
// Same authLimiter as login - refresh-token guessing is a variant of
// the same brute-force surface.
router.post("/token/refresh", authLimiter, validate({ body: refreshTokenBody }), controller.refreshToken);

// PHASE 10 (mobile): forgot/reset password, called by UBee's
// ForgotPasswordPage/ResetPasswordPage. Same authLimiter as login -
// both are a brute-force surface (email enumeration, OTP guessing).
router.post("/forgot-password", authLimiter, validate({ body: forgotPasswordBody }), controller.forgotPassword);
router.post("/reset-password", authLimiter, validate({ body: resetPasswordBody }), controller.resetPassword);

router.post("/logout", validate({ body: logoutBody }), controller.logout);

module.exports = router;
