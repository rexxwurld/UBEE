const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    fullname: String,
    email: { type: String, unique: true },
    phone: { type: String, index: true },
    // select: false - FOUND WHILE WORKING ON PHASE 4 (not in the
    // original audit): without this, User.findOne(...) returns the
    // bcrypt password hash by default, and both register and login in
    // auth.controller.js send the full `user` document straight back
    // in the JSON response - meaning every register/login call was
    // handing the caller their own password hash. Bcrypt hashes aren't
    // trivially reversible, but there's no reason to ever return this
    // over the API, and doing so needlessly hands an attacker who
    // intercepts a response (or a client-side log that captures it)
    // material for offline brute-forcing. auth.service.js's login/
    // register queries now explicitly .select("+password") where the
    // hash is actually needed for comparison.
    password: { type: String, select: false },
    createdAt: { type: Date, default: Date.now },

    // --- MFA (Phase 4) ---
    // Opt-in, not mandatory - see src/modules/otp/ for why: OTP
    // "delivery" is currently a stub (no real SMS/email provider
    // connected, same honest limitation as sendToDestinationBank for
    // payouts). Forcing this on by default would lock every user out
    // in production the moment they tried to log in. A user who has
    // enabled it has explicitly gone through POST /auth/mfa/enable +
    // verify, at which point it's on them/the operator to have a real
    // delivery provider wired in first.
    mfaEnabled: { type: Boolean, default: false },

    // --- KYC (Phase 3) ---
    //
    // Modeled on the CBN's three-tier KYC framework (see
    // src/config/limits.js for the tier -> transaction-limit mapping and
    // its accuracy caveat - the exact figures move with CBN circulars).
    // Tier progression here is deliberately NOT automatic: submitting
    // BVN/NIN moves kycStatus to "submitted", not kycTier upward - an
    // admin (kyc.service.js:verifyKyc) has to actually approve it. There
    // is no real BVN/NIN verification provider wired up yet (that's a
    // Phase 5-shaped provider integration - NIBSS/NIMC lookup), so
    // "submitted" today just means "the user says this is their BVN/NIN",
    // not "this has been confirmed against the real registry."
    kycTier: {
        type: String,
        enum: ["tier1", "tier2", "tier3"],
        default: "tier1"
    },
    kycStatus: {
        type: String,
        enum: ["unverified", "submitted", "verified", "rejected"],
        default: "unverified"
    },

    // BVN/NIN are never stored in plaintext - see src/utils/fieldEncryption.js.
    // *Hash fields carry a unique index: a real control against one BVN/NIN
    // being used to open multiple accounts, which duplicate plaintext
    // storage alone wouldn't give you (AES-GCM output isn't deterministic,
    // so it can't back a uniqueness check by itself).
    bvnHash: { type: String, default: null, unique: true, sparse: true },
    bvnEncrypted: { type: String, default: null },
    ninHash: { type: String, default: null, unique: true, sparse: true },
    ninEncrypted: { type: String, default: null },

    dateOfBirth: { type: Date, default: null },

    kycSubmittedAt: { type: Date, default: null },
    kycVerifiedAt: { type: Date, default: null },
    // Free-text operator identifier, same caveat as Adjustment.performedBy -
    // not real per-operator RBAC (Phase 4), just attributability for now.
    kycVerifiedBy: { type: String, default: null },
    kycRejectionReason: { type: String, default: null },

    // --- Account state (Phase 3) ---
    //
    // Distinct from Wallet.status, which is about POOL/virtual-account
    // lifecycle (available/assigned/deactivated - see wallet.model.js).
    // This is the actual "can this customer use their account" state a
    // real bank needs: freeze for suspected fraud/compliance holds,
    // dormant for CBN-style inactivity classification, closed for a
    // terminated account. Lives on User rather than Wallet because it's
    // fundamentally an account-holder-level state, not a balance-level
    // one - a User with multiple wallets in the future (audit §4's
    // "multiple accounts per customer" gap) should freeze as a customer,
    // not per-wallet, in the common case (though a wallet-level override
    // could be added later for partial freezes if ever needed).
    accountState: {
        type: String,
        enum: ["active", "frozen", "dormant", "closed"],
        default: "active"
    },
    accountStateReason: { type: String, default: null },
    accountStateChangedAt: { type: Date, default: null },
    accountStateChangedBy: { type: String, default: null }
});

module.exports = mongoose.model("User", userSchema);
