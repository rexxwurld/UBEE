// src/modules/deviceToken/deviceToken.model.js
//
// One row per device a user has registered for push notifications
// (typically an FCM or APNs token from the MAUI app). A user can have
// several - phone + tablet, or having reinstalled the app and gotten a
// new token without the old one being explicitly removed yet.

const mongoose = require("mongoose");

const deviceTokenSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        token: { type: String, required: true, unique: true },
        platform: { type: String, enum: ["ios", "android", "web"], required: true },
        lastSeenAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

module.exports = mongoose.model("DeviceToken", deviceTokenSchema);
