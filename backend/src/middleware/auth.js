const jwt = require("jsonwebtoken");

// PHASE 10: accepts EITHER the httpOnly cookie (web clients) OR an
// Authorization: Bearer <accessToken> header (mobile/native clients,
// which don't have a browser cookie jar - flagged directly in the
// audit's §17: "Cookie-based JWT is a poor fit for a MAUI app"). Cookie
// checked first only because it was the original behavior and changing
// precedence isn't necessary - a request will only ever sensibly
// present one or the other, not both.
module.exports = (req, res, next) => {
    let token = req.cookies?.token;

    if (!token) {
        const authHeader = req.headers["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.slice(7);
        }
    }

    if (!token) {
        return res.status(401).json({ message: "No token" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            id: decoded.id,
            email: decoded.email
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};
