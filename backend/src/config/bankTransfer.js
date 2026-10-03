// src/config/bankTransfer.js
//
// Customer "To Bank" transfers (U-BEE wallet -> an account at another
// bank). Wallet-to-wallet U-BEE transfers are always free; only these
// outward bank transfers are charged, after the daily free allowance.
// All values are env-configurable so they can change without a deploy.

const FEE = Number(process.env.BANK_TRANSFER_FEE || 10);              // NGN per transfer once free ones are used
const FREE_PER_DAY = Number(process.env.BANK_TRANSFER_FREE_PER_DAY || 3);
const MIN_AMOUNT = Number(process.env.BANK_TRANSFER_MIN || 100);       // NGN

// "Today" for the free allowance is the Nigerian calendar day (WAT, UTC+1,
// no daylight saving), not a rolling 24h, so the 3 free transfers reset
// at midnight where the customer is.
const WAT_OFFSET_MS = 60 * 60 * 1000;
function startOfLagosDay(now = new Date()) {
    const local = now.getTime() + WAT_OFFSET_MS;
    return new Date(Math.floor(local / 86400000) * 86400000 - WAT_OFFSET_MS);
}

module.exports = { FEE, FREE_PER_DAY, MIN_AMOUNT, startOfLagosDay };
