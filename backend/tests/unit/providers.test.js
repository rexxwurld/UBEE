// tests/unit/providers.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertValidProvider, REQUIRED_METHODS } = require("../../src/providers/bankProvider.interface");
const mockBankProvider = require("../../src/providers/mockBankProvider");

test("mockBankProvider implements every method the interface requires", () => {
    assert.doesNotThrow(() => assertValidProvider(mockBankProvider, "mock"));
});

test("assertValidProvider throws a clear, named error when a method is missing", () => {
    const incomplete = { ...mockBankProvider };
    delete incomplete.checkTransferStatus;

    assert.throws(
        () => assertValidProvider(incomplete, "incomplete-test-provider"),
        /checkTransferStatus/
    );
});

test("REQUIRED_METHODS lists exactly the six documented interface methods", () => {
    assert.deepEqual(
        [...REQUIRED_METHODS].sort(),
        ["checkTransferStatus", "initiateTransfer", "listBanks", "nameEnquiry", "normalizeDepositWebhook", "verifyWebhookSignature"].sort()
    );
});

test("mockBankProvider.initiateTransfer always returns status 'accepted' with a unique reference", async () => {
    const first = await mockBankProvider.initiateTransfer({ amount: 1000, destinationAccountNumber: "123", destinationBankCode: "058" });
    const second = await mockBankProvider.initiateTransfer({ amount: 1000, destinationAccountNumber: "123", destinationBankCode: "058" });

    assert.equal(first.status, "accepted");
    assert.notEqual(first.providerReference, second.providerReference, "each call must get a unique reference");
});

test("mockBankProvider.checkTransferStatus always returns 'unknown' (honest - no real transfer exists to check)", async () => {
    const result = await mockBankProvider.checkTransferStatus({ reference: "anything", providerReference: null });
    assert.equal(result.status, "unknown");
});

test("mockBankProvider.listBanks returns a non-empty array of {code, name}", async () => {
    const banks = await mockBankProvider.listBanks();
    assert.ok(Array.isArray(banks) && banks.length > 0);
    for (const bank of banks) {
        assert.equal(typeof bank.code, "string");
        assert.equal(typeof bank.name, "string");
    }
});

test("mockBankProvider.verifyWebhookSignature always returns false (no real webhook traffic to trust)", () => {
    assert.equal(mockBankProvider.verifyWebhookSignature({}), false);
});

test("provider registry: unknown BANK_PROVIDER throws a clear, actionable error", () => {
    delete require.cache[require.resolve("../../src/providers/index")];
    const savedProvider = process.env.BANK_PROVIDER;
    process.env.BANK_PROVIDER = "totally-not-a-real-provider";

    const { getActiveProvider } = require("../../src/providers/index");
    assert.throws(() => getActiveProvider(), /unknown_bank_provider/);

    process.env.BANK_PROVIDER = savedProvider;
});

test("provider registry: defaults to 'mock' when BANK_PROVIDER is unset", () => {
    delete require.cache[require.resolve("../../src/providers/index")];
    const savedProvider = process.env.BANK_PROVIDER;
    delete process.env.BANK_PROVIDER;

    const { getActiveProviderName } = require("../../src/providers/index");
    assert.equal(getActiveProviderName(), "mock");

    if (savedProvider !== undefined) process.env.BANK_PROVIDER = savedProvider;
});
