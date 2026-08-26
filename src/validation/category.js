import joi from "joi";

export const createCategorySchema = joi.object({
    name: joi.string().min(2).max(100).trim().required(),
});

export const updateCategorySchema = joi.object({
    name: joi.string().min(2).max(100).trim().optional(),
    isActive: joi.boolean().optional(),
}).min(1); // at least one field required
