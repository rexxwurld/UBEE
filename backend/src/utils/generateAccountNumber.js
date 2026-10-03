const Wallet = require("../modules/wallet/wallet.model");

const generateAccountNumber = async () => {

    let accountNumber;
    let exists = true;

    while (exists) {

        accountNumber = "10" + Math.floor(10000000 + Math.random() * 90000000);

        const found = await Wallet.findOne({ accountNumber });

        if (!found) {
            exists = false;
        }
    }

    return accountNumber;
};

module.exports = generateAccountNumber;