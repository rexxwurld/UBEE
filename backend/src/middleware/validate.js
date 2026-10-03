// src/middleware/validate.js
//
// Was completely absent before (audit §9: "no Joi/Zod/express-validator
// in package.json... validation is ad hoc, inline, and inconsistent per-
// service"). This is the centralized replacement: every route below
// declares a zod schema for whichever of body/params/query it expects,
// and this middleware validates + coerces BEFORE the controller ever
// sees the request, replacing req.body/params/query with the parsed
// (and now type-correct - e.g. numeric strings coerced to numbers)
// result.
//
// Deliberately does NOT replace the service-layer business-rule checks
// already in place throughout this codebase (insufficient balance,
// duplicate reference, account not found, etc.) - this middleware only
// catches shape/type/format problems (missing field, wrong type,
// malformed email, negative amount) before they reach business logic,
// the same division of responsibility Joi/Zod/express-validator are
// meant to have in any Express app.
//
// Error response shape is intentionally structured and field-level
// (not just a string), matching what Phase 10 (mobile/API readiness)
// flagged as needed for a real client to map errors to form fields.

function validate({ body, params, query } = {}) {
    return (req, res, next) => {
        const errors = [];

        function runSchema(schema, source, target) {
            if (!schema) return;
            const result = schema.safeParse(source);
            if (!result.success) {
                for (const issue of result.error.issues) {
                    errors.push({
                        in: target,
                        field: issue.path.join(".") || target,
                        message: issue.message
                    });
                }
                return;
            }

            if (target === "query") {
                // Express 5 made req.query a getter with no setter -
                // `req.query = result.data` throws
                // "Cannot set property query of #<IncomingMessage> which
                // has only a getter" on every request that reaches this
                // branch, which would have meant every query-validated
                // route in this app 500ing unconditionally. Defining an
                // own property shadows the prototype getter instead of
                // trying to assign through it - the documented
                // workaround for this specific Express 5 change.
                Object.defineProperty(req, "query", {
                    value: result.data,
                    writable: true,
                    configurable: true,
                    enumerable: true
                });
            } else {
                req[target] = result.data;
            }
        }

        runSchema(body, req.body, "body");
        runSchema(params, req.params, "params");
        runSchema(query, req.query, "query");

        if (errors.length > 0) {
            return res.status(422).json({ status: false, message: "validation_failed", errors });
        }

        next();
    };
}

module.exports = validate;
