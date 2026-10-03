// tests/unit/fieldEncryption.test.js
//
// Zero external dependencies - uses Node's built-in test runner
// (node --test) and assert module, not Jest, specifically so these can
// run in ANY environment including one with no network/npm install
// access, like the one these were originally written in. See
// tests/integration/ for the Jest + mongodb-memory-server suite that
// covers the DB-dependent service layer instead.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

process.env.FIELD_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
const { encryptField, decryptField, hashField } = require("../../src/utils/fieldEncryption");

test("encryptField/decryptField round-trips correctly", () => {
    const bvn = "22234567891";
    const encrypted = encryptField(bvn);
    assert.notEqual(encrypted, bvn, "encrypted value must not equal plaintext");
    assert.equal(decryptField(encrypted), bvn);
});

test("encryptField produces a different ciphertext each call (random IV)", () => {
    const value = "12345678901";
    const first = encryptField(value);
    const second = encryptField(value);
    assert.notEqual(first, second, "AES-GCM must never reuse an IV - same plaintext should never produce identical ciphertext");
    assert.equal(decryptField(first), value);
    assert.equal(decryptField(second), value);
});

test("hashField is deterministic", () => {
    const value = "12345678901";
    assert.equal(hashField(value), hashField(value));
});

test("hashField output never equals the plaintext", () => {
    const value = "12345678901";
    assert.notEqual(hashField(value), value);
});

test("hashField distinguishes different inputs", () => {
    assert.notEqual(hashField("11111111111"), hashField("22222222222"));
});

test("decryptField throws on tampered ciphertext (GCM auth tag catches it)", () => {
    const encrypted = encryptField("12345678901");
    const [iv, tag, data] = encrypted.split(":");
    const tamperedData = data.slice(0, -2) + (data.slice(-2) === "00" ? "01" : "00");
    const tampered = `${iv}:${tag}:${tamperedData}`;

    assert.throws(() => decryptField(tampered));
});

test("encryptField/hashField throw a clear error when FIELD_ENCRYPTION_KEY is unset", () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    try {
        assert.throws(() => encryptField("12345678901"), /FIELD_ENCRYPTION_KEY is not set/);
    } finally {
        process.env.FIELD_ENCRYPTION_KEY = saved;
    }
});

test("encryptField/decryptField handle null/empty gracefully", () => {
    assert.equal(encryptField(null), null);
    assert.equal(encryptField(""), null);
    assert.equal(decryptField(null), null);
});
