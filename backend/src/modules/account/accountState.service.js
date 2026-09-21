// src/modules/account/accountState.service.js
//
// Freeze/unfreeze/mark-dormant/close for a CUSTOMER's account - the
// gap the audit flagged in §4/§10: "no account freeze/close mechanism
// for end-user wallets... only pool-wallet status exists." This is
// that mechanism. Lives on User.accountState (see user.model.js's
// comment on why it's there and not on Wallet).
//
// Deliberately every transition here is explicit and requires a reason
// - there is no "just set accountState = X" shortcut anywhere else in
// the codebase; this service is the only place that's allowed to
// change it, and every change is audit-logged at "critical" severity,
// same as src/modules/adjustment - freezing a real customer's account
// is exactly the kind of action that should never happen quietly.

const User = require("../auth/user.model");
const auditLog = require("../audit/auditLog.service");

const VALID_STATES = ["active", "frozen", "dormant", "closed"];

async function setAccountState(userId, { state, reason, performedBy = null }) {
    if (!VALID_STATES.includes(state)) throw new Error("invalid_account_state");
    if (!reason || !reason.trim()) throw new Error("reason_required");

    const user = await User.findById(userId);
    if (!user) throw new Error("user_not_found");

    if (user.accountState === state) {
        return { unchanged: true, user: sanitize(user) };
    }

    const previousState = user.accountState;

    user.accountState = state;
    user.accountStateReason = reason;
    user.accountStateChangedAt = new Date();
    user.accountStateChangedBy = performedBy;
    await user.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: `account.state_changed_to_${state}`,
        entityType: "User",
        entityRef: userId.toString(),
        severity: "critical",
        metadata: { previousState, newState: state, reason }
    });

    return { unchanged: false, user: sanitize(user) };
}

async function getAccountState(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error("user_not_found");
    return sanitize(user);
}

function sanitize(user) {
    return {
        userId: user._id,
        accountState: user.accountState,
        accountStateReason: user.accountStateReason,
        accountStateChangedAt: user.accountStateChangedAt,
        accountStateChangedBy: user.accountStateChangedBy
    };
}

module.exports = { setAccountState, getAccountState, VALID_STATES };
