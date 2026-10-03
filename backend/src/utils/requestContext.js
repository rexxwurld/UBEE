// src/utils/requestContext.js
//
// Node's built-in AsyncLocalStorage (no new dependency) - lets any code
// running as part of handling one request read that request's ID,
// without req being threaded through every function call in between.
// This is what lets auditLog.service.js automatically stamp every audit
// entry with the request that caused it, even from deep inside
// payout.service.js/deposit.service.js/etc, which have never taken a
// `req` parameter and shouldn't have to start now just for logging.

const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function run(requestId, callback) {
    return storage.run({ requestId }, callback);
}

function getRequestId() {
    const store = storage.getStore();
    return store ? store.requestId : null;
}

module.exports = { run, getRequestId };
