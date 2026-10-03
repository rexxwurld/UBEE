const { z } = require("zod");

const nameEnquiryQuery = z.object({
    accountNumber: z.string().trim().min(1, "accountNumber_required"),
    bankCode: z.string().trim().min(1, "bankCode_required")
});

module.exports = { nameEnquiryQuery };
