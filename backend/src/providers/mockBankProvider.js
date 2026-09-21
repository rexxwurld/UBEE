// src/providers/mockBankProvider.js
//
// The default provider (BANK_PROVIDER unset, or "mock"). Same behavior
// as the old inline sendToDestinationBank() stubs that used to live
// directly in payout.service.js/refund.service.js - always "succeeds"
// instantly - just reshaped to the real provider contract
// (bankProvider.interface.js) so payout/refund service code doesn't
// need to change again when a real provider replaces this.
//
// NEVER use this for real money. There is no real bank connection
// here - initiateTransfer always reports "accepted" without any funds
// actually moving anywhere outside this database.

const crypto = require("crypto");

// A handful of real Nigerian bank codes/names for listBanks() and to
// make nameEnquiry() return something plausible-looking in dev/testing
// - NOT a complete or currently-accurate list, just enough to exercise
// the UI/validation flow. A real provider integration returns its own
// live list.
const MOCK_BANKS = [
    { code: "044", name: "Access Bank" },
    { code: "058", name: "Guaranty Trust Bank" },
    { code: "057", name: "Zenith Bank" },
    { code: "011", name: "First Bank of Nigeria" },
    { code: "033", name: "United Bank for Africa" },
    { code: "070", name: "Fidelity Bank" },
    { code: "050", name: "Ecobank Nigeria" },
    { code: "221", name: "Stanbic IBTC Bank" }
];

async function initiateTransfer({ amount, destinationAccountNumber, destinationBankCode, destinationAccountName, reference }) {
    return {
        providerReference: `mock_ref_${crypto.randomBytes(8).toString("hex")}`,
        status: "accepted",
        raw: { note: "MOCK PROVIDER - no real transfer occurred", amount, destinationAccountNumber, destinationBankCode, reference }
    };
}

async function checkTransferStatus({ reference, providerReference }) {
    // The mock provider has no real record of anything - it always
    // reports "unknown" so callers (the recovery job) correctly fall
    // back to flagging for human review rather than being told a false
    // "success"/"failed" that didn't actually happen anywhere.
    return { status: "unknown" };
}

async function nameEnquiry({ accountNumber, bankCode }) {
    return { accountName: `MOCK ACCOUNT ${accountNumber}`, bankCode, accountNumber };
}

async function listBanks() {
    return MOCK_BANKS;
}

// The mock provider has no real inbound webhook traffic to verify -
// this always returns false (reject) so nothing can accidentally rely
// on a mock "always trust it" signature check. Real deposit simulation
// for dev/testing goes through src/modules/bankPartner/mockBank.routes.js
// instead (a direct, NODE_ENV-gated call into processDeposit), not
// through this provider's webhook path.
function verifyWebhookSignature(req) {
    return false;
}

function normalizeDepositWebhook(rawBody) {
    throw new Error("mock_provider_does_not_receive_real_webhooks");
}

module.exports = {
    initiateTransfer,
    checkTransferStatus,
    nameEnquiry,
    listBanks,
    verifyWebhookSignature,
    normalizeDepositWebhook
};
