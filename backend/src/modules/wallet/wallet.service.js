const Wallet = require("./wallet.model");
const generateAccountNumber = require("../../utils/generateAccountNumber");

// CREATE WALLET (AUTO ON REGISTER)
const createWallet = async (userId) => {

    const accountNumber = await generateAccountNumber();

    const wallet = await Wallet.create({
        userId,
        accountNumber,
        balance: 0
    });

    return wallet;
};

// GET WALLET
const getWallet = async (userId) => {
    return await Wallet.findOne({ userId });
};

// NOTE: creditWallet/debitWallet (direct, non-atomic, non-ledgered
// Wallet.balance mutation) have been removed. They were unsafe - no
// DB session, no ledger entry, no audit log - and one of them
// (creditWallet) was reachable by any authenticated user via a route
// that has also been removed (see wallet.routes.js / wallet.controller.js).
//
// Any code that needs to move money into or out of a wallet must go
// through a session + ledger-entry flow, same as transaction.service.js
// (transfers), deposit.service.js (external deposits), and
// src/modules/adjustment (admin-initiated corrections).

module.exports = {
    createWallet,
    getWallet
};
