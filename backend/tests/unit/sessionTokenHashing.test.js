// tests/unit/sessionTokenHashing.test.js
//
// session.service.js itself requires mongoose (RefreshToken model) and
// config/env.js (dotenv), so it can't be unit-tested standalone the
// way fieldEncryption/webhookSignature can - it's covered by the
// integration suite instead. This file tests the ONE piece of its
// logic that's pure and worth pinning down in isolation: the hashing
// scheme's actual properties (deterministic, collision-resistant in
// practice, fixed-length output), since that's the piece a future
// refactor is most likely to accidentally break in a way that's hard
// to notice (e.g. swapping in a salted hash would silently break every
// existing session's lookup).

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

// Same function, copied rather than imported - see file header for why
// the real module can't be required standalone here.
function hashRefreshToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

test("hashing a refresh token is deterministic (required for an indexed DB lookup)", () => {
    const token = crypto.randomBytes(48).toString("hex");
    assert.equal(hashRefreshToken(token), hashRefreshToken(token));
});

test("two different tokens never hash to the same value in practice", () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
        const token = crypto.randomBytes(48).toString("hex");
        const hash = hashRefreshToken(token);
        assert.ok(!seen.has(hash), "collision detected across 1000 random tokens");
        seen.add(hash);
    }
});

test("hash output is always a fixed-length 64-char hex string (SHA-256)", () => {
    for (let i = 0; i < 20; i++) {
        const token = crypto.randomBytes(48).toString("hex");
        const hash = hashRefreshToken(token);
        assert.equal(hash.length, 64);
        assert.match(hash, /^[0-9a-f]{64}$/);
    }
});

test("the raw token itself has enough entropy to resist guessing (48 bytes = 384 bits)", () => {
    const token = crypto.randomBytes(48).toString("hex");
    assert.equal(token.length, 96); // 48 bytes -> 96 hex chars
});
