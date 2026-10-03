// src/notifications/mockNotificationProvider.js
//
// Default provider. Logs to console (clearly marked) instead of
// actually delivering anything - no real FCM/APNs/web-push credential
// is connected. Unlike the OTP delivery stub (which THROWS in
// production because an undelivered MFA code is a lockout), this one
// stays soft and just reports "sent" - a missed push notification
// about a completed transfer is a degraded experience, not a security
// or money-safety issue, so it doesn't need to be load-bearing the way
// MFA delivery does.

async function send({ userId, type, title, body, data }) {
    console.log(`[notification] (MOCK - not delivered anywhere real) to user ${userId}: [${type}] ${title} - ${body}`, data || {});
    return { status: "sent" };
}

module.exports = { send };
