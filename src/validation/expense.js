import joi from "joi";

const EXPENSE_CATEGORIES = ["rent", "utilities", "transport", "maintenance", "supplies", "misc"];

export const createExpenseSchema = joi.object({
    branchId:    joi.string().hex().length(24).required(),
    category:    joi.string().valid(...EXPENSE_CATEGORIES).required(),
    amount:      joi.number().min(0.01).required(),
    description: joi.string().max(300).trim().optional().allow("", null),
    date:        joi.date().iso().max("now").default(() => new Date()),
    // max("now") prevents future-dated expenses — they're a bookkeeping smell
    // and block accidental date entry errors (e.g. year 2025 typed as 2205).
});

export const updateExpenseSchema = joi.object({
    category:    joi.string().valid(...EXPENSE_CATEGORIES).optional(),
    amount:      joi.number().min(0.01).optional(),
    description: joi.string().max(300).trim().optional().allow("", null),
    date:        joi.date().iso().max("now").optional(),
}).min(1); // at least one field required
