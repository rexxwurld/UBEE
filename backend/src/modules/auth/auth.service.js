
const User = require("./user.model");
const { hashPassword, comparePassword } = require("../../utils/hash");
const generateToken = require("../../utils/token");

const { createWallet } = require("../wallet/wallet.service");

const register = async (data) => {

    const exists = await User.findOne({ email: data.email });
    if (exists) throw new Error("User already exists");

    const hashed = await hashPassword(data.password);

    const user = await User.create({
        fullname: data.fullname,
        email: data.email,
        phone: data.phone,
        password: hashed
    });

    await createWallet(user._id);

    // select:false on the schema only affects future find()/findOne()
    // reads - a document just returned from .create() still has
    // `password` populated in memory from the input we gave it. Strip
    // it explicitly before this ever reaches a controller/response.
    user.password = undefined;

    return user;
};

const login = async (email, password) => {

    const user = await User.findOne({ email }).select("+password");
    if (!user) throw new Error("Invalid credentials");

    const match = await comparePassword(password, user.password);
    if (!match) throw new Error("Invalid credentials");

    const token = generateToken(user);

    // Explicitly selected above (+password) to run the comparison -
    // strip it before this document goes anywhere near a response, same
    // reasoning as register() above.
    user.password = undefined;

    return { user, token };
};

module.exports = { register, login };