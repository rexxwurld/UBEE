// src/modules/auth/pin.service.js
//
// The one place a PIN is checked against a user's stored hash - used by
// login AND by "confirm with your PIN" on money-moving requests (wallet
// transfers, bank transfers). They deliberately share ONE set of
// failed-attempt counters: a thief holding an unlocked phone can't get
// extra PIN guesses by hammering the transfer screen instead of login.

const User = require("./user.model");
const { comparePassword } = require("../../utils/hash");

const MAX_PIN_ATTEMPTS = Number(process.env.PIN_MAX_ATTEMPTS || 5);
const PIN_LOCK_MS = Number(process.env.PIN_LOCK_MS || 15 * 60 * 1000);
const LOCK_MESSAGE = "Too many wrong PIN attempts. Try again in a few minutes or use Forgot PIN.";

// `user` must have been loaded with .select("+pin +pinFailedAttempts +pinLockedUntil").
// Returns { ok, locked, attemptsLeft }.
async function checkPin(user, pin) {
    if (!user.pin) return { ok: false, locked: false, attemptsLeft: 0, noPin: true };
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) return { ok: false, locked: true, attemptsLeft: 0 };

    const match = await comparePassword(pin || "", user.pin);

    if (match) {
        if (user.pinFailedAttempts || user.pinLockedUntil) {
            await User.updateOne({ _id: user._id }, { pinFailedAttempts: 0, pinLockedUntil: null });
        }
        return { ok: true, locked: false, attemptsLeft: MAX_PIN_ATTEMPTS };
    }

    // Atomic increment so parallel guesses can't dodge the counter.
    const updated = await User.findOneAndUpdate(
        { _id: user._id }, { $inc: { pinFailedAttempts: 1 } }, { new: true }
    ).select("+pinFailedAttempts");
    const failed = updated?.pinFailedAttempts || 1;

    if (failed >= MAX_PIN_ATTEMPTS) {
        await User.updateOne(
            { _id: user._id },
            { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) }
        );
        return { ok: false, locked: true, attemptsLeft: 0 };
    }
    return { ok: false, locked: false, attemptsLeft: MAX_PIN_ATTEMPTS - failed };
}

// For an already-signed-in user confirming a sensitive action.
// Throws a customer-readable Error unless the PIN is right.
async function verifyPinForUser(userId, pin) {
    const user = await User.findById(userId).select("+pin +pinFailedAttempts +pinLockedUntil");
    if (!user) throw new Error("user_not_found");

    const r = await checkPin(user, pin);
    if (r.ok) return;
    if (r.noPin) throw new Error("You haven't set a PIN yet. Use Forgot PIN to set one.");
    if (r.locked) throw new Error(LOCK_MESSAGE);
    throw new Error(`Incorrect PIN. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? "" : "s"} left.`);
}

module.exports = { checkPin, verifyPinForUser, LOCK_MESSAGE, MAX_PIN_ATTEMPTS };
