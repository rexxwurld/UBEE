// src/notifications/notificationProvider.interface.js
//
// PHASE 10 PREP - same "define the contract, ship a mock, make it
// swappable via env var" pattern as src/providers/ (Phase 5), applied
// to push notifications since there's no real FCM/APNs/web-push
// credential connected here either. Closes the audit's §17 gap:
// "no event system, no webhook-out for 'your transfer completed' type
// notifications to a mobile client."
//
// send({ userId, type, title, body, data }) -> { status }
//   status: "sent" | "failed" | "no_device_registered"
//   type is a short machine-readable event name (e.g.
//   "transfer_received", "deposit_confirmed") - a real provider
//   implementation can use it to pick a notification category/channel
//   (iOS notification category, Android channel ID, etc), the mock
//   doesn't need it beyond logging.
//   data is a small plain object of extra fields the CLIENT app might
//   want (e.g. { transactionId }) to deep-link when the notification is
//   tapped - passed through untouched to whatever the real provider's
//   payload shape is.
//   Must never throw for an ordinary "couldn't deliver" outcome -
//   expressed via `status`, not an exception, same principle as
//   bankProvider.interface.js's initiateTransfer.

const REQUIRED_METHODS = ["send"];

function assertValidProvider(provider, name) {
    const missing = REQUIRED_METHODS.filter((m) => typeof provider[m] !== "function");
    if (missing.length > 0) {
        throw new Error(
            `notification_provider_incomplete: provider "${name}" is missing required method(s): ${missing.join(", ")}. ` +
            `See src/notifications/notificationProvider.interface.js for the full contract.`
        );
    }
}

module.exports = { REQUIRED_METHODS, assertValidProvider };
