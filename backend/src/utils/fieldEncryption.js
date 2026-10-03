// src/utils/fieldEncryption.js
//
// AES-256-GCM encryption for individual sensitive fields (BVN, NIN) -
// not full-database or transport encryption, just "don't store this
// specific highly sensitive value in plaintext in MongoDB." The audit
// flagged this as a gap the moment real BVN/NIN fields were added
// (§14: "PII storage... worth a deliberate decision once real BVN/NIN
// fields are added - those should not be stored in plaintext").
//
// Design:
//   - encryptField(plaintext) -> "iv:authTag:ciphertext" (all hex),
//     using a fresh random IV every call (AES-GCM requires this - never
//     reuse an IV with the same key). Reversible, for the rare case an
//     authorized operator genuinely needs to see the underlying value
//     (e.g. manual compliance/regulatory request).
//   - hashField(plaintext) -> deterministic HMAC-SHA256 hex digest,
//     used ONLY for uniqueness/lookup (e.g. "has this BVN already been
//     used to open an account" - a real fraud control), never for
//     display. Encryption output is non-deterministic (random IV), so
//     it cannot back a unique index by itself - the hash is what the
//     unique index actually applies to.
//
// FIELD_ENCRYPTION_KEY must be a 32-byte key, base64 or hex encoded, set
// via environment variable. There is no default - unlike some of this
// project's other config, a missing encryption key should fail loudly
// at startup, not silently fall back to something insecure.

const crypto = require("crypto");

function loadKey() {
    const raw = process.env.FIELD_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "FIELD_ENCRYPTION_KEY is not set. Generate one with " +
            "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
            "and set it in your environment before storing BVN/NIN data."
        );
    }
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) {
        throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (hex or base64).");
    }
    return buf;
}

// Derive separate subkeys for encryption vs. hashing from the one master
// key, rather than using the same raw key for two different crypto
// primitives (AES-GCM and HMAC). Deterministic (same master key always
// derives the same subkeys), so this doesn't need its own storage.
function deriveSubkey(masterKey, info) {
    return Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), Buffer.from(info), 32));
}

function encryptField(plaintext) {
    if (plaintext == null || plaintext === "") return null;
    const key = deriveSubkey(loadKey(), "rexxpay-field-encryption-v1");
    const iv = crypto.randomBytes(12); // 96-bit IV, standard for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptField(stored) {
    if (!stored) return null;
    const key = deriveSubkey(loadKey(), "rexxpay-field-encryption-v1");
    const [ivHex, tagHex, dataHex] = stored.split(":");
    if (!ivHex || !tagHex || !dataHex) throw new Error("malformed_encrypted_field");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return plaintext.toString("utf8");
}

function hashField(plaintext) {
    if (plaintext == null || plaintext === "") return null;
    const key = deriveSubkey(loadKey(), "rexxpay-field-hash-v1");
    return crypto.createHmac("sha256", key).update(String(plaintext)).digest("hex");
}

module.exports = { encryptField, decryptField, hashField };
