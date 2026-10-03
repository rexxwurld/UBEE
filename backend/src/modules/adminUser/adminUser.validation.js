const { z } = require("zod");

const bootstrapBody = z.object({
    username: z.string().trim().toLowerCase().min(3, "username_must_be_at_least_3_characters").max(100),
    password: z.string().min(12, "password_must_be_at_least_12_characters").max(200)
});

const loginBody = z.object({
    username: z.string().trim().toLowerCase().min(1, "username_required"),
    password: z.string().min(1, "password_required")
});

const createAdminBody = z.object({
    username: z.string().trim().toLowerCase().min(3, "username_must_be_at_least_3_characters").max(100),
    password: z.string().min(12, "password_must_be_at_least_12_characters").max(200),
    role: z.enum(["superadmin", "ops", "compliance", "support"], {
        errorMap: () => ({ message: "invalid_role" })
    })
});

const usernameParams = z.object({
    username: z.string().trim().min(1)
});

const setStatusBody = z.object({
    status: z.enum(["active", "disabled"], { errorMap: () => ({ message: "invalid_status" }) })
});

module.exports = { bootstrapBody, loginBody, createAdminBody, usernameParams, setStatusBody };
