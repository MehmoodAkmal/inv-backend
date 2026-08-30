import joi from "joi";

const objectId = () => joi.string().hex().length(24);

export const createCustomerSchema = joi.object({
    branchId: objectId().required(),
    name:     joi.string().min(2).max(100).trim().required(),
    phone:    joi.string().max(20).trim().optional().allow("", null),
    address:  joi.string().max(200).trim().optional().allow("", null),
    openingBalance: joi.number().min(0).default(0),
});

export const updateCustomerSchema = joi.object({
    name:     joi.string().min(2).max(100).trim().optional(),
    phone:    joi.string().max(20).trim().optional().allow("", null),
    address:  joi.string().max(200).trim().optional().allow("", null),
    isActive: joi.boolean().optional(),
}).min(1);
