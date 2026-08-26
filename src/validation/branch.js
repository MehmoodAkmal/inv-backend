import joi from "joi";

export const createBranchSchema = joi.object({
    name: joi.string().min(2).max(100).required(),
    address: joi.string().optional(),
});

export const updateBranchSchema = joi.object({
    name: joi.string().min(2).max(100).optional(),
    address: joi.string().optional(),
}).min(1); // at least one field must be present
