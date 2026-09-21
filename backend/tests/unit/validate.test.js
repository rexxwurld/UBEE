// tests/unit/validate.test.js
//
// validate.js itself has zero dependencies (it just calls
// schema.safeParse()) - these tests use a hand-rolled fake schema
// object mimicking zod's safeParse() contract, since real zod isn't
// installed in this sandbox. The schemas in src/modules/*/*.validation.js
// DO require real zod and are covered by the integration suite
// (tests/integration/) instead, which documents that dependency.

const test = require("node:test");
const assert = require("node:assert/strict");
const validate = require("../../src/middleware/validate");

function passingSchema(transform = (x) => x) {
    return { safeParse: (data) => ({ success: true, data: transform(data) }) };
}

function failingSchema(issues) {
    return { safeParse: () => ({ success: false, error: { issues } }) };
}

function fakeReqResNext(overrides = {}) {
    const req = { body: {}, params: {}, query: {}, ...overrides };
    let statusCode = null;
    let jsonBody = null;
    const res = {
        status(code) { statusCode = code; return this; },
        json(body) { jsonBody = body; return this; }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    return { req, res, next, getStatus: () => statusCode, getJson: () => jsonBody, wasNextCalled: () => nextCalled };
}

test("calls next() and replaces req.body when the body schema passes", () => {
    const { req, next, wasNextCalled } = fakeReqResNext({ body: { amount: "100" } });
    const middleware = validate({ body: passingSchema((d) => ({ amount: Number(d.amount) })) });

    middleware(req, {}, next);

    assert.ok(wasNextCalled());
    assert.deepEqual(req.body, { amount: 100 });
});

test("returns 422 with structured field errors when the body schema fails, and does NOT call next()", () => {
    const { req, res, next, getStatus, getJson, wasNextCalled } = fakeReqResNext({ body: {} });
    const middleware = validate({
        body: failingSchema([{ path: ["amount"], message: "amount_required" }])
    });

    middleware(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatus(), 422);
    const body = getJson();
    assert.equal(body.status, false);
    assert.equal(body.errors.length, 1);
    assert.equal(body.errors[0].field, "amount");
    assert.equal(body.errors[0].in, "body");
});

test("aggregates errors from body, params, AND query in one response", () => {
    const { req, res, next, getJson } = fakeReqResNext({ body: {}, params: {}, query: {} });
    const middleware = validate({
        body: failingSchema([{ path: ["reason"], message: "reason_required" }]),
        params: failingSchema([{ path: ["id"], message: "id_required" }]),
        query: failingSchema([{ path: ["status"], message: "invalid_status" }])
    });

    middleware(req, res, next);

    const body = getJson();
    assert.equal(body.errors.length, 3);
    const fields = body.errors.map((e) => `${e.in}.${e.field}`).sort();
    assert.deepEqual(fields, ["body.reason", "params.id", "query.status"]);
});

test("req.params can be reassigned directly (unlike req.query, Express 5 doesn't restrict this)", () => {
    const { req, next } = fakeReqResNext({ params: { id: "abc" } });
    const middleware = validate({ params: passingSchema((d) => ({ id: d.id.toUpperCase() })) });

    middleware(req, {}, next);
    assert.equal(req.params.id, "ABC");
});

test("req.query is updated via Object.defineProperty, not direct assignment - works even when query is getter-only (Express 5 behavior)", () => {
    const req = { body: {}, params: {} };
    // Simulates Express 5's actual behavior: req.query is a getter with
    // no setter. A naive `req.query = x` would throw or silently no-op
    // here (see app.js's comment on this exact issue, found and fixed
    // during Phase 4) - this test exists specifically so a future
    // regression back to plain assignment gets caught immediately.
    Object.defineProperty(req, "query", {
        get() { return { status: "open" }; },
        configurable: true,
        enumerable: true
    });

    const { res, next, wasNextCalled } = fakeReqResNext();
    const middleware = validate({ query: passingSchema((d) => ({ status: d.status.toUpperCase() })) });

    assert.doesNotThrow(() => middleware(req, res, next));
    assert.ok(wasNextCalled());
    assert.equal(req.query.status, "OPEN", "the coerced value must actually take effect, not silently fail");
});

test("a route with no schemas at all just calls next() unconditionally", () => {
    const { req, next, wasNextCalled } = fakeReqResNext();
    const middleware = validate({});
    middleware(req, {}, next);
    assert.ok(wasNextCalled());
});
