const User = require("./user.model");
const { hashPassword } = require("../../utils/hash");
const { checkPin, LOCK_MESSAGE } = require("./pin.service");
const generateToken = require("../../utils/token");
const { toNational } = require("../../utils/phone");

const { createWallet } = require("../wallet/wallet.service");

// `data.phone` has already been normalized to 08160135713 by the zod
// schema (auth.validation.js); the account number is that, minus the 0.
const register = async (data) => {

    const accountNumber = toNational(data.phone);
    if (!accountNumber) throw new Error("invalid_nigerian_phone_number");

    const phoneTaken = await User.findOne({ phone: data.phone });
    if (phoneTaken) throw new Error("An account with this phone number already exists");

    const emailTaken = await User.findOne({ email: data.email });
    if (emailTaken) throw new Error("User already exists");

    const hashed = await hashPassword(data.pin);

    const user = await User.create({
        fullname: data.fullname,
        email: data.email,
        phone: data.phone,
        pin: hashed
    });

    try {
        await createWallet(user._id, accountNumber);
    } catch (err) {
        // Don't leave a user with no wallet behind (e.g. the account
        // number is somehow already taken) - they could never log in
        // usefully and couldn't re-register with the same phone.
        await User.deleteOne({ _id: user._id });
        throw err;
    }

    // select:false on the schema only affects future find()/findOne()
    // reads - a document just returned from .create() still has `pin`
    // populated in memory. Strip it before it reaches a response.
    user.pin = undefined;

    return user;
};

const login = async (phone, pin) => {

    const user = await User.findOne({ phone }).select("+pin +pinFailedAttempts +pinLockedUntil");

    // Same message whether the phone is unknown or the PIN is wrong -
    // don't let a caller learn which phone numbers have accounts.
    if (!user || !user.pin) throw new Error("Invalid credentials");

    const check = await checkPin(user, pin);
    if (check.locked) throw new Error(LOCK_MESSAGE);
    if (!check.ok) throw new Error("Invalid credentials");

    const token = generateToken(user);

    // Selected above to run the comparison - strip before this document
    // goes anywhere near a response.
    user.pin = undefined;
    user.pinFailedAttempts = undefined;
    user.pinLockedUntil = undefined;

    return { user, token };
};

module.exports = { register, login };
