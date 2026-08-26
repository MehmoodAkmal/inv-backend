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