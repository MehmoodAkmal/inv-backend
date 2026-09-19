import joi from "joi";

const objectId = () => joi.string().hex().length(24);

export const createEmployeeSchema = joi.object({
    branchId:      objectId().required(),
    name:          joi.string().min(2).max(100).trim().required(),
    phone:         joi.string().max(20).trim().optional().allow("", null),
    designation:   joi.string().max(100).trim().optional().allow("", null),
    // Optional at creation — defaults to 0 when auto-created from staff registration
    monthlySalary: joi.number().min(0).optional().default(0),
    // Optional link back to portal user account
    userId:        objectId().optional().allow(null),
});

export const updateEmployeeSchema = joi.object({
    name:          joi.string().min(2).max(100).trim().optional(),
    phone:         joi.string().max(20).trim().optional().allow("", null),
    designation:   joi.string().max(100).trim().optional().allow("", null),
    monthlySalary: joi.number().min(0).optional(),
    isActive:      joi.boolean().optional(),
}).min(1);
