import joi from "joi";

const objectId = () => joi.string().hex().length(24);

// YYYY-MM regex — validated here at the Joi layer so the controller
// never receives a malformed month string.
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const recordSalaryPaymentSchema = joi.object({
    employeeId: objectId().required(),
    month:      joi.string().pattern(monthPattern).required()
                   .messages({ "string.pattern.base": "month must be in YYYY-MM format (e.g. 2026-08)" }),
    amount:     joi.number().min(0.01).required(),
    status:     joi.string().valid("paid", "partial", "pending").default("paid"),
    note:       joi.string().max(300).trim().optional().allow("", null),
});

export const getSalaryPaymentsSchema = joi.object({
    branchId:   objectId().optional(),
    employeeId: objectId().optional(),
    month:      joi.string().pattern(monthPattern).optional(),
    page:       joi.number().integer().min(1).default(1),
    limit:      joi.number().integer().min(1).max(200).default(20),
});
