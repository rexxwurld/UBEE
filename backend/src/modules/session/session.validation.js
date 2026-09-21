const { z } = require("zod");

const sessionIdParams = z.object({
    sessionId: z.string().trim().min(1)
});

module.exports = { sessionIdParams };
