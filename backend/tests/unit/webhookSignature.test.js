// tests/unit/webhookSignature.test.js
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SWIFTPAY_WEBHOOK_SECRET = "test-secret-for-unit-tests-only";
process.env.JWT_SECRET = "test";
process.env.ADMIN_KEY = "test";

const { signPayload, verifySignature } = require("../../src/utils/webhookSignature");

test("signPayload is deterministic for the same payload+secret", () => {
    const payload = { accountNumber: "1234567890", amount: 5000 };
    assert.equal(signPayload(payload, "secret-a"), signPayload(payload, "secret-a"));
});

test("signPayload produces a different signature for a different secret", () => {
    const payload = { accountNumber: "1234567890", amount: 5000 };
    assert.notEqual(signPayload(payload, "secret-a"), signPayload(payload, "secret-b"));
});

test("verifySignature accepts a signature generated with the same secret", () => {
    const payload = { accountNumber: "1234567890", amount: 5000 };
    const sig = signPayload(payload, "secret-a");
    assert.equal(verifySignature(payload, sig, "secret-a"), true);
});

test("verifySignature rejects a signature generated with a DIFFERENT secret", () => {
    // This is the core multi-partner isolation guarantee (Phase 3a) -
    // one partner's secret must never validate against another's traffic.
    const payload = { accountNumber: "1234567890", amount: 5000 };
    const sig = signPayload(payload, "partner-a-secret");
    assert.equal(verifySignature(payload, sig, "partner-b-secret"), false);
});

test("verifySignature rejects a tampered payload even with the right secret", () => {
    const original = { accountNumber: "1234567890", amount: 5000 };
    const sig = signPayload(original, "secret-a");
    const tampered = { accountNumber: "1234567890", amount: 999999999 };
    assert.equal(verifySignature(tampered, sig, "secret-a"), false);
});

test("verifySignature returns false (not throw) for a missing signature", () => {
    const payload = { accountNumber: "1234567890", amount: 5000 };
    assert.equal(verifySignature(payload, undefined, "secret-a"), false);
    assert.equal(verifySignature(payload, null, "secret-a"), false);
});

test("verifySignature returns false for a malformed/non-hex signature rather than throwing", () => {
    const payload = { accountNumber: "1234567890", amount: 5000 };
    assert.equal(verifySignature(payload, "not-valid-hex!!", "secret-a"), false);
});
