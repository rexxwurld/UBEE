// src/providers/bankProvider.interface.js
//
// PHASE 5 PREP. This is the contract any real banking-rail provider
// (NIBSS directly, or an aggregator/BaaS layer like Providus, Paystack,
// Flutterwave, Wema, etc.) must implement to plug into RexxPay. Nothing
// in payout.service.js, refund.service.js, or the deposit webhook route
// talks to a specific provider's API directly anymore (Phase 5, before
// this file existed, hardcoded a stub inline in each of those files) -
// they all talk to whatever provider is currently active through this
// shape, via src/providers/index.js:getActiveProvider().
//
// Connecting a real provider is meant to be: write one new file
// implementing these methods (see mockBankProvider.js as the template),
// register it in src/providers/index.js, set BANK_PROVIDER=<name> in
// the environment. Nothing else in the codebase should need to change.
//
// Every method is async even where a real implementation might be
// synchronous, since every real provider call is a network request.
//
// ===================================================================
// initiateTransfer({ amount, destinationAccountNumber, destinationBankCode,
//                     destinationAccountName, reference, narration })
//   -> { providerReference, status, raw }
//
//   status is one of:
//     "accepted"  - the provider has taken the instruction. This does
//                   NOT mean the money has landed - it means "queued/
//                   processing" from the provider's point of view.
//                   Callers (payout.service.js) mark the payout
//                   "success" on this, matching how this codebase has
//                   always treated payouts (acceptance, not confirmed
//                   delivery - see refund.service.js's own comment on
//                   this same distinction).
//     "rejected"  - the provider definitively refused the instruction
//                   (bad account, insufficient provider-side balance,
//                   invalid bank code, etc.) - safe to reverse
//                   immediately, funds never left.
//     "ambiguous" - the call itself failed in a way that doesn't tell
//                   you whether the transfer happened (timeout,
//                   connection reset, 5xx from the provider, etc.).
//                   THIS IS THE CASE THE AUDIT EXPLICITLY WARNED ABOUT:
//                   "Network ambiguity must NOT be auto-reversed."
//                   Callers must NOT reverse on this status - they
//                   flag the payout/refund "requires_review" instead
//                   (same status the stuck-transfer recovery job uses)
//                   so a human/checkTransferStatus resolves it later.
//   Must never throw for a normal failed/ambiguous outcome - those are
//   real, expected results and are expressed via the returned `status`,
//   not an exception. Throwing is reserved for a genuine programming
//   error (e.g. this function being called with a malformed payload).
//
// checkTransferStatus({ reference, providerReference }) -> { status }
//   status is one of: "success", "failed", "unknown".
//   Takes BOTH: `reference` is the client-supplied idempotent reference
//   originally passed to initiateTransfer (payout._id.toString() /
//   refund._id.toString() in this codebase), `providerReference` is
//   what the provider returned IF the call made it far enough to get
//   one and RexxPay actually managed to persist it. Deliberately
//   queryable by `reference` alone: the exact case this exists for is
//   a crash between debiting the pool and getting/saving the
//   provider's response, in which case providerReference may be null -
//   a real provider adapter should support looking up a transfer by
//   the client reference it was given, which is standard for
//   idempotent payment APIs and is the whole reason initiateTransfer
//   is called with a stable reference in the first place.
//   Used by the stuck-transfer recovery job (src/jobs/recoverStuckTransfers.job.js)
//   to try to actually RESOLVE a stuck payout/refund by asking the
//   provider directly, instead of only ever flagging it for a human.
//   "unknown" (including "this provider doesn't support status checks")
//   is always a safe, honest answer - the recovery job falls back to
//   requires_review when it gets this.
//
// nameEnquiry({ accountNumber, bankCode }) -> { accountName }
//   Real capability most Nigerian bank-rail providers offer: confirm
//   whose account a number belongs to BEFORE sending money to it - a
//   genuine misdirected-payout control the current stub has no
//   equivalent for at all.
//
// listBanks() -> [{ code, name }]
//   The set of destination banks this provider can actually pay out to
//   - used to validate destinationBank on a payout/refund instruction
//   and to populate a bank-selection UI.
//
// verifyWebhookSignature(req) -> boolean
//   Provider-specific inbound signature scheme for THEIR deposit
//   webhooks - deliberately separate from and unrelated to
//   verifyPartnerSignature.js (which is RexxPay's OWN uniform scheme
//   for partner<->RexxPay traffic). Every banking-rail provider has its
//   own header name/algorithm for this, which is exactly why it has to
//   be pluggable per-provider rather than hardcoded once.
//
// normalizeDepositWebhook(rawBody) -> { accountNumber, amount, reference, rawPayload }
//   Maps the provider's own webhook payload shape into the shape
//   deposit.service.js:processDeposit already expects, so
//   processDeposit itself never needs to know which provider is active.
// ===================================================================

const REQUIRED_METHODS = [
    "initiateTransfer",
    "checkTransferStatus",
    "nameEnquiry",
    "listBanks",
    "verifyWebhookSignature",
    "normalizeDepositWebhook"
];

// Fails loudly at registration time (src/providers/index.js) if a
// provider module is missing a required method, rather than failing
// confusingly later at the exact moment a real payout tries to use it -
// same "fail loudly, not silently" principle as FIELD_ENCRYPTION_KEY
// and the OTP delivery stub elsewhere in this codebase.
function assertValidProvider(provider, name) {
    const missing = REQUIRED_METHODS.filter((m) => typeof provider[m] !== "function");
    if (missing.length > 0) {
        throw new Error(
            `bank_provider_incomplete: provider "${name}" is missing required method(s): ${missing.join(", ")}. ` +
            `See src/providers/bankProvider.interface.js for the full contract.`
        );
    }
}

module.exports = { REQUIRED_METHODS, assertValidProvider };
