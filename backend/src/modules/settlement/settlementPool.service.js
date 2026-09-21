// src/modules/settlement/settlementPool.service.js
const SettlementPool = require("./settlementPool.model");

async function createPool({ label, linkedService, currency = "NGN" }) {
    return SettlementPool.create({ label, linkedService, currency });
}

async function getPoolByService(linkedService) {
    return SettlementPool.findOne({ linkedService, status: "active" });
}

// Must be called inside the same session as the matching Wallet.balance
// and LedgerEntry writes, so pool balance never drifts from wallet-level
// activity. Positive amount only - direction decides add vs subtract.
async function creditPool(poolId, amount, session) {
    if (!session) throw new Error("pool_requires_session");

    amount = Number(amount);

    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("pool_invalid_amount");
    }

    const pool = await SettlementPool.findById(poolId).session(session);
    if (!pool) throw new Error("pool_not_found");

    pool.poolBalance += amount;

    await pool.save({ session });
    return pool;
}

async function debitPool(poolId, amount, session) {
    if (!session) throw new Error("pool_requires_session");

    amount = Number(amount);

    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("pool_invalid_amount");
    }

    const pool = await SettlementPool.findById(poolId).session(session);

    if (!pool) throw new Error("pool_not_found");

    if (pool.poolBalance < amount) {
        throw new Error("pool_insufficient_funds");
    }

    pool.poolBalance -= amount;

    await pool.save({ session });
    return pool;
}

module.exports = { createPool, getPoolByService, creditPool, debitPool };
