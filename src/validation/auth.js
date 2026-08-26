import joi from "joi";

export const loginSchema = joi.object({
  email: joi.string().email().required(),
  password: joi.string().min(6).required()
});

export const signupSchema = joi.object({
  firstName: joi.string().min(2).max(50).required(),
  lastName: joi.string().min(2).max(50).required(),
  email: joi.string().email().required(),
  password: joi.string().min(6).max(128).required(),
  organizationName: joi.string().min(2).max(100).required(),
});

export const createStaffSchema = joi.object({
  firstName: joi.string().min(2).max(50).required(),
  lastName: joi.string().min(2).max(50).required(),
  email: joi.string().email().required(),
  password: joi.string().min(6).max(128).required(),
  role: joi.string().valid("manager", "cashier").required(),
  branchId: joi.string().hex().length(24).required(),
});

export const updateStaffSchema = joi.object({
  firstName: joi.string().min(2).max(50).optional(),
  lastName: joi.string().min(2).max(50).optional(),
  branchId: joi.string().hex().length(24).optional(),
  isActive: joi.boolean().optional(),
}).min(1); // at least one field must be present
