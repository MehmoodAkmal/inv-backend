import joi from "joi";

const UNITS = ["kg", "bag", "piece", "litre", "box"];

export const createItemSchema = joi.object({
    categoryId: joi.string().hex().length(24).required(),
    name: joi.string().min(2).max(150).trim().required(),
    sku: joi.string().max(50).trim().optional().allow(""),
    unit: joi.string().valid(...UNITS).default("piece"),
    costPrice: joi.number().min(0).required(),
    sellingPrice: joi.number().min(0).required(),
    reorderLevel: joi.number().min(0).default(0),
});

export const updateItemSchema = joi.object({
    categoryId: joi.string().hex().length(24).optional(),
    name: joi.string().min(2).max(150).trim().optional(),
    sku: joi.string().max(50).trim().optional().allow(""),
    unit: joi.string().valid(...UNITS).optional(),
    costPrice: joi.number().min(0).optional(),
    sellingPrice: joi.number().min(0).optional(),
    reorderLevel: joi.number().min(0).optional(),
    isActive: joi.boolean().optional(),
}).min(1);
