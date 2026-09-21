// src/providers/index.js
//
// Registry of available bank-rail provider adapters. To connect a real
// provider (NIBSS directly, or a BaaS/aggregator):
//   1. Create src/providers/<yourProviderName>BankProvider.js
//      implementing every method in bankProvider.interface.js.
//   2. Add it to the `providers` map below.
//   3. Set BANK_PROVIDER=<yourProviderName> in the environment.
// Nothing in payout.service.js, refund.service.js, the recovery job, or
// the bank-webhook routes needs to change - they all call
// getActiveProvider() and use whatever comes back.

const { assertValidProvider } = require("./bankProvider.interface");
const mockBankProvider = require("./mockBankProvider");

const providers = {
    mock: mockBankProvider
    // nibss: require("./nibssBankProvider"),
    // providus: require("./providusBankProvider"),
    // etc.
};

function getActiveProvider() {
    const name = process.env.BANK_PROVIDER || "mock";
    const provider = providers[name];

    if (!provider) {
        throw new Error(
            `unknown_bank_provider: BANK_PROVIDER="${name}" is not registered in src/providers/index.js. ` +
            `Available: ${Object.keys(providers).join(", ")}`
        );
    }

    assertValidProvider(provider, name);
    return provider;
}

// Which provider is active, without loading/validating it - useful for
// logging/health checks without the assertValidProvider side effect.
function getActiveProviderName() {
    return process.env.BANK_PROVIDER || "mock";
}

module.exports = { getActiveProvider, getActiveProviderName };
