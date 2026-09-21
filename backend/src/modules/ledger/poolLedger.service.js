// src/modules/ledger/poolLedger.service.js
const PoolLedgerEntry = require("./poolLedger.model");

async function postPoolEntry({ pool, direction, amount, sourceType, sourceRef, description, session }) {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("pool_ledger_invalid_amount");
    }
    if (!session) {
        throw new Error("pool_ledger_requires_session");
    }

    const [entry] = await PoolLedgerEntry.create(
        [{ pool, direction, amount, sourceType, sourceRef, description }],
        { session, ordered: true }
    );
    return entry;
}

async function computePoolBalance(poolId) {
    const [result] = await PoolLedgerEntry.aggregate([
        { $match: { pool: poolId } },
        {
            $group: {
                _id: null,
                credits: { $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amount", 0] } },
                debits: { $sum: { $cond: [{ $eq: ["$direction", "debit"] }, "$amount", 0] } }
            }
        }
    ]);
    if (!result) return 0;
    return result.credits - result.debits;
}

module.exports = { postPoolEntry, computePoolBalance };
