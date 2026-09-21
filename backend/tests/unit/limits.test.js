// tests/unit/limits.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { getLimitsForTier, TIER_LIMITS } = require("../../src/config/limits");

test("getLimitsForTier returns the correct tier's limits", () => {
    assert.equal(getLimitsForTier("tier1"), TIER_LIMITS.tier1);
    assert.equal(getLimitsForTier("tier2"), TIER_LIMITS.tier2);
    assert.equal(getLimitsForTier("tier3"), TIER_LIMITS.tier3);
});

test("getLimitsForTier falls back to the MOST RESTRICTIVE tier for an unknown/missing value", () => {
    // This is a real security property, not just a default - an
    // unrecognized tier must never silently grant MORE room than the
    // safest tier would.
    assert.equal(getLimitsForTier("nonexistent"), TIER_LIMITS.tier1);
    assert.equal(getLimitsForTier(undefined), TIER_LIMITS.tier1);
    assert.equal(getLimitsForTier(null), TIER_LIMITS.tier1);
});

test("tiers are monotonically increasing (tier2 >= tier1, tier3 >= tier2)", () => {
    assert.ok(TIER_LIMITS.tier2.maxSingleTransfer >= TIER_LIMITS.tier1.maxSingleTransfer);
    assert.ok(TIER_LIMITS.tier3.maxSingleTransfer >= TIER_LIMITS.tier2.maxSingleTransfer);
    assert.ok(TIER_LIMITS.tier2.maxDailyOutbound >= TIER_LIMITS.tier1.maxDailyOutbound);
    assert.ok(TIER_LIMITS.tier3.maxDailyOutbound >= TIER_LIMITS.tier2.maxDailyOutbound);
});

test("tier3 has no cumulative balance cap", () => {
    assert.equal(TIER_LIMITS.tier3.maxCumulativeBalance, null);
});

test("every tier's limits are positive numbers", () => {
    for (const tier of ["tier1", "tier2", "tier3"]) {
        assert.ok(TIER_LIMITS[tier].maxSingleTransfer > 0, `${tier}.maxSingleTransfer`);
        assert.ok(TIER_LIMITS[tier].maxDailyOutbound > 0, `${tier}.maxDailyOutbound`);
    }
});
