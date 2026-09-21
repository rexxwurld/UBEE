// tests/unit/requestContext.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const requestContext = require("../../src/utils/requestContext");

test("getRequestId returns null outside any run() context", () => {
    assert.equal(requestContext.getRequestId(), null);
});

test("getRequestId returns the ID inside a run() context", async () => {
    await requestContext.run("req-123", async () => {
        assert.equal(requestContext.getRequestId(), "req-123");
    });
});

test("context propagates through nested async/await calls", async () => {
    async function deepCall() {
        await new Promise((r) => setTimeout(r, 5));
        return requestContext.getRequestId();
    }

    await requestContext.run("req-456", async () => {
        const seen = await deepCall();
        assert.equal(seen, "req-456");
    });
});

test("context propagates into fire-and-forget (un-awaited) async work", async () => {
    let seenInFireAndForget = null;
    let fireAndForgetDone;
    const fireAndForgetPromise = new Promise((resolve) => { fireAndForgetDone = resolve; });

    async function fireAndForgetWebhookCall() {
        await new Promise((r) => setTimeout(r, 10));
        seenInFireAndForget = requestContext.getRequestId();
        fireAndForgetDone();
    }

    await requestContext.run("req-789", async () => {
        fireAndForgetWebhookCall(); // deliberately not awaited, mirrors real usage
    });

    await fireAndForgetPromise;
    assert.equal(seenInFireAndForget, "req-789");
});

test("two concurrent run() contexts don't leak into each other", async () => {
    const results = [];

    await Promise.all([
        requestContext.run("req-A", async () => {
            await new Promise((r) => setTimeout(r, 15));
            results.push(["A", requestContext.getRequestId()]);
        }),
        requestContext.run("req-B", async () => {
            await new Promise((r) => setTimeout(r, 5));
            results.push(["B", requestContext.getRequestId()]);
        })
    ]);

    const a = results.find((r) => r[0] === "A");
    const b = results.find((r) => r[0] === "B");
    assert.equal(a[1], "req-A");
    assert.equal(b[1], "req-B");
});
