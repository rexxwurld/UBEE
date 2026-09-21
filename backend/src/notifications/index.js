// src/notifications/index.js
// Same registry pattern as src/providers/index.js (Phase 5) - see that
// file's comment for the full reasoning. To connect a real push
// provider: implement send() in a new file, register it below, set
// NOTIFICATION_PROVIDER=<name>.

const { assertValidProvider } = require("./notificationProvider.interface");
const mockNotificationProvider = require("./mockNotificationProvider");

const providers = {
    mock: mockNotificationProvider
    // fcm: require("./fcmNotificationProvider"),
    // apns: require("./apnsNotificationProvider"),
};

function getActiveNotificationProvider() {
    const name = process.env.NOTIFICATION_PROVIDER || "mock";
    const provider = providers[name];
    if (!provider) {
        throw new Error(`unknown_notification_provider: NOTIFICATION_PROVIDER="${name}" is not registered.`);
    }
    assertValidProvider(provider, name);
    return provider;
}

module.exports = { getActiveNotificationProvider };
