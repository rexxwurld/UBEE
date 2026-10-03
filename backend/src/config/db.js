const mongoose = require("mongoose");

const connectDB = async (MONGO_URI) => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB connected");
    } catch (err) {
        console.log("DB error:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;