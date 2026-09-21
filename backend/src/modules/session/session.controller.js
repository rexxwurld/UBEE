const sessionService = require("./session.service");

// GET /api/v1/auth/sessions  (auth)
exports.listSessions = async (req, res) => {
    try {
        const sessions = await sessionService.listActiveSessions(req.user.id);
        res.json({ status: true, count: sessions.length, data: sessions });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// DELETE /api/v1/auth/sessions/:sessionId  (auth)
exports.revokeSession = async (req, res) => {
    try {
        await sessionService.revokeSessionById(req.user.id, req.params.sessionId);
        res.json({ status: true, message: "session_revoked" });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/auth/sessions/revoke-all  (auth)
// Body: { keepCurrentSession?: boolean } - not reliably knowable which
// RefreshToken row corresponds to "this" request (the caller is
// authenticated via a short-lived access token, not the refresh token
// itself), so this always revokes ALL sessions including the one that
// issued the currently-used access token. That token simply keeps
// working until its own 15-minute expiry, then the client must log in
// again - "log out everywhere" reasonably implying exactly that.
exports.revokeAllSessions = async (req, res) => {
    try {
        const count = await sessionService.revokeAllSessions(req.user.id);
        res.json({ status: true, message: "all_sessions_revoked", count });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
