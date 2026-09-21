// src/config/limits.js
//
// Previously flat for all users. Now tiered by KYC level, matching the
// CBN's three-tier KYC framework - see src/modules/kyc/.
//
// IMPORTANT: the figures below are illustrative placeholders based on
// commonly-cited CBN tiered-KYC limits as of this writing, cross-checked
// against multiple public sources - they are NOT guaranteed to be the
// exact, current, legally-binding figures. CBN limits have been revised
// upward multiple times via circular since the framework's 2013
// introduction (most recently reported: Tier 1 ~₦50,000/single deposit,
// ~₦300,000 cumulative balance; Tier 2 ~₦200,000/single deposit,
// ~₦500,000 cumulative balance, requiring BOTH BVN and NIN on file since
// a Dec 2023 update; Tier 3 ~₦5,000,000/day, no cumulative balance cap).
// CONFIRM THE EXACT CURRENT FIGURES AGAINST THE LATEST CBN CIRCULAR (and
// your compliance counsel) before relying on these for a real launch -
// do not treat this file as a source of regulatory truth.
//
// All limits are configurable via environment variables so they can be
// corrected/updated without a code change once verified.

const TIER_LIMITS = {
    tier1: {
        maxSingleTransfer: Number(process.env.TIER1_MAX_SINGLE_TRANSFER || 50000),   // ₦50,000
        maxDailyOutbound: Number(process.env.TIER1_MAX_DAILY_OUTBOUND || 50000),     // ₦50,000
        maxCumulativeBalance: Number(process.env.TIER1_MAX_BALANCE || 300000)        // ₦300,000
    },
    tier2: {
        maxSingleTransfer: Number(process.env.TIER2_MAX_SINGLE_TRANSFER || 200000),  // ₦200,000
        maxDailyOutbound: Number(process.env.TIER2_MAX_DAILY_OUTBOUND || 500000),    // ₦500,000
        maxCumulativeBalance: Number(process.env.TIER2_MAX_BALANCE || 500000)        // ₦500,000
    },
    tier3: {
        maxSingleTransfer: Number(process.env.TIER3_MAX_SINGLE_TRANSFER || 5000000), // ₦5,000,000
        maxDailyOutbound: Number(process.env.TIER3_MAX_DAILY_OUTBOUND || 5000000),   // ₦5,000,000
        maxCumulativeBalance: null // no cap, per the tier3 sources above
    }
};

function getLimitsForTier(tier) {
    return TIER_LIMITS[tier] || TIER_LIMITS.tier1; // unknown/missing tier -> most restrictive
}

module.exports = {
    TIER_LIMITS,
    getLimitsForTier,

    // Kept for anything not yet migrated to tier-aware limits - equal to
    // tier1 (the safest default) rather than the old, more permissive
    // flat values, so nothing accidentally becomes MORE permissive by
    // this change.
    MAX_SINGLE_TRANSFER: TIER_LIMITS.tier1.maxSingleTransfer,
    MAX_DAILY_OUTBOUND: TIER_LIMITS.tier1.maxDailyOutbound
};
