// src/modules/deviceToken/notification.service.js
const DeviceToken = require("./deviceToken.model");
const { getActiveNotificationProvider } = require("../../notifications");

async function registerDevice(userId, { token, platform }) {
    if (!token) throw new Error("token_required");
    if (!["ios", "android", "web"].includes(platform)) throw new Error("invalid_platform");

    // Upsert on token (not userId+platform) - a device token belongs to
    // exactly one installation; if it somehow got registered under a
    // different user previously (e.g. app reinstalled and logged in as
    // someone else on the same device), this call correctly reassigns
    // it rather than creating a duplicate/orphaned row.
    return DeviceToken.findOneAndUpdate(
        { token },
        { userId, platform, lastSeenAt: new Date() },
        { upsert: true, new: true }
    );
}

async function unregisterDevice(userId, token) {
    await DeviceToken.deleteOne({ userId, token });
}

// Fire-and-forget by design, same as notifyPartnerOfDeposit/
// notifyPartnerOfTransfer in deposit.service.js/transaction.service.js -
// a failed or undelivered push notification must never block or fail
// the actual money-moving operation that triggered it. Callers should
// NOT await this in a way that lets its failure propagate.
async function notifyUser(userId, { type, title, body, data }) {
    const devices = await DeviceToken.find({ userId });
    if (devices.length === 0) return { status: "no_device_registered" };

    const provider = getActiveNotificationProvider();
    const results = await Promise.allSettled(
        devices.map((d) => provider.send({ userId, type, title, body, data }))
    );

    return { status: "dispatched", deviceCount: devices.length, results: results.map((r) => r.status) };
}

module.exports = { registerDevice, unregisterDevice, notifyUser };
