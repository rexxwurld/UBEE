// src/providers/bankWebhook.routes.js
//
// PHASE 5 PREP. This is the real landing point for a provider's
// inbound deposit-notification webhooks - distinct from
// src/modules/bankPartner/mockBank.routes.js, which is a dev-only
// simulator that calls processDeposit directly with no provider
// involved at all. This route is what actually receives traffic FROM
// a real bank/provider once one is connected.
//
// Mounted at POST /api/v1/webhooks/bank/:providerName so a provider's
// webhook URL bakes in which provider it is (e.g.
// https://yourapp.com/api/v1/webhooks/bank/providus) - this route then
// loads THAT specific provider's adapter to verify the signature and
// interpret the payload, rather than guessing or assuming there's only
// ever one provider.
//
// Every provider has its own webhook signature scheme (different header
// name, different algorithm) - that's exactly why
// verifyWebhookSignature() and normalizeDepositWebhook() are part of
// the pluggable interface (bankProvider.interface.js) rather than
// hardcoded here.

const router = require("express").Router();
const { getActiveProvider, getActiveProviderName } = require("./index");
const { processDeposit } = require("../modules/deposit/deposit.service");

router.post("/:providerName", async (req, res) => {
    try {
        const activeName = getActiveProviderName();

        // The URL names a provider explicitly - if it doesn't match the
        // currently-active provider, reject rather than silently
        // processing it with the wrong adapter's verification/parsing
        // logic (which would almost certainly fail signature
        // verification anyway, but failing with a clear reason here is
        // better than a confusing downstream error).
        if (req.params.providerName !== activeName) {
            return res.status(404).json({ status: false, message: "unknown_or_inactive_provider" });
        }

        const provider = getActiveProvider();

        const validSignature = await provider.verifyWebhookSignature(req);
        if (!validSignature) {
            return res.status(401).json({ status: false, message: "invalid_webhook_signature" });
        }

        const { accountNumber, amount, reference, rawPayload } = await provider.normalizeDepositWebhook(req.body);

        const result = await processDeposit({ accountNumber, amount, reference, rawPayload: rawPayload ?? req.body });

        // Real providers generally just need a 2xx to stop retrying -
        // held/duplicate/confirmed all get one, since all three mean
        // "we received and durably recorded this notification," which
        // is what the provider's retry logic actually cares about.
        res.status(200).json({ status: true, duplicate: !!result.duplicate, held: !!result.held });
    } catch (err) {
        console.error("[bank_webhook] processing error:", err.message);

        // Distinguish "this notification is permanently unprocessable"
        // (retrying won't help - e.g. it doesn't match any known
        // wallet, or lands on an account not currently expecting a
        // deposit) from everything else (a transient DB hiccup, a bug,
        // network blip) where the provider SHOULD retry. Swallowing
        // every error into a 200 would silently stop a provider from
        // retrying a webhook that failed for a reason that might well
        // succeed on the next attempt - the wrong default for a
        // webhook receiver.
        const TERMINAL_ERRORS = [
            "destination_wallet_not_found",
            "wallet_not_linked_to_a_settlement_pool",
            "wallet_not_currently_assigned",
            "destination_account_not_active"
        ];

        if (TERMINAL_ERRORS.includes(err.message)) {
            return res.status(200).json({ status: false, message: "recorded_for_manual_review", error: err.message });
        }

        // Anything else: let it surface as a 5xx so the provider's own
        // retry logic (which every real provider has for webhooks) has
        // a chance to succeed on a later attempt.
        res.status(500).json({ status: false, message: "processing_error_provider_should_retry" });
    }
});

module.exports = router;
