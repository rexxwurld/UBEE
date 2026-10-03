const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({

    // Required for normal end-user wallets. Left null for pool/virtual
    // accounts (linkedService set to a partner's slug) - those aren't
    // owned by any real person, so there's no user to reference.
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    accountNumber: {
        type: String,
        required: true,
        unique: true
    },
    expectedAmount: {
    type: Number,
    default: null
},
    

    balance: {
        type: Number,
        default: 0
    },

    // null = a normal end-user wallet.
    // Any other string = the slug of the Partner this pool/virtual
    // account belongs to (see src/modules/partner/) - "swiftpay" for
    // the original integration, but no longer restricted to that one
    // literal value by a schema enum. Validated against a live,
    // active Partner record at the point a wallet is provisioned
    // (admin.service.js) rather than by a hardcoded enum here, since
    // the set of valid partners is now data (the Partner collection),
    // not a fixed list known at schema-definition time.
    linkedService: {
        type: String,
        default: null
    },

    // Only meaningful for pool wallets (linkedService set to some
    // partner's slug).
    // available:   free for the owning partner to hand out to a customer.
    // assigned:    currently in use for an active checkout on the partner's side.
    // deactivated: checkout finished (or was abandoned), account is in
    //              the partner's cooldown - not in active use, but also
    //              not back in the pool yet, so a deposit landing here
    //              now is still unrecognized and gets rejected the same
    //              as if it were "assigned" (see deposit.service.js).
    // The owning partner is the source of truth for WHEN this flips (it
    // owns the checkout lifecycle) - this field just mirrors that so
    // the bank's own records/dashboard agree with the partner's pool
    // state.
    status: {
        type: String,
        enum: ["available", "assigned", "deactivated"],
        default: "available"
    },

    // Which SettlementPool this wallet's real funds sit in. Set for
    // any partner-linked wallet (and, going forward, any wallet whose
    // deposits should count toward a pool rather than being fully
    // self-contained). Null for plain end-user wallets with no pool backing.
    pool: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SettlementPool",
        default: null
    }

}, { timestamps: true });

module.exports = mongoose.model("Wallet", walletSchema);
