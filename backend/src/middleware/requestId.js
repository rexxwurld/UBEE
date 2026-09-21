// src/middleware/requestId.js
//
// Every request gets a stable ID (a real UUID, or the caller's own
// X-Request-Id if they already sent one - useful when a partner wants
// to correlate their own logs with RexxPay's for one specific call).
// Attached to req.id, echoed back as a response header, and threaded
// into morgan's log line format (see app.js) so a single request's
// full lifecycle - the HTTP access log line AND any audit log entries
// it caused - can actually be found and correlated by one ID.
//
// This is the concrete answer to the audit's §15 question ("could an
// operator investigate '₦100,000 disappeared from this customer's
// account yesterday' using the available logs and records") for the
// specific gap it named: "no correlation/request IDs... an operator has
// no way to search 'which webhook deliveries failed in the last hour'
// except grepping raw process stdout."

const crypto = require("crypto");
const requestContext = require("../utils/requestContext");

module.exports = function requestId(req, res, next) {
    req.id = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("x-request-id", req.id);
    // Everything downstream of next() - including code deep inside a
    // service function that never sees `req` at all - can now read this
    // request's ID via requestContext.getRequestId(). This also covers
    // fire-and-forget async work KICKED OFF during the request (e.g.
    // notifyPartnerOfDeposit's un-awaited webhook calls), since they're
    // still part of the same async execution chain even though the
    // response may already have been sent.
    requestContext.run(req.id, next);
};
