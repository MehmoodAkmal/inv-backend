import joi from "joi";

export const updateProfileSchema = joi.object({
  firstName: joi.string().min(2).max(50).trim().required(),
  lastName: joi.string().min(2).max(50).trim().required(),
  email: joi.string().email().lowercase().trim().required(),
  phone: joi.string().max(25).trim().allow("", null).optional(),
});

export const changePasswordSchema = joi.object({
  currentPassword: joi.string().required().messages({
    "string.empty": "Current password is required",
    "any.required": "Current password is required",
  }),
  newPassword: joi.string().min(6).max(128).required().messages({
    "string.min": "New password must be at least 6 characters long",
    "string.empty": "New password is required",
    "any.required": "New password is required",
  }),
  confirmPassword: joi.string().valid(joi.ref("newPassword")).required().messages({
    "any.only": "Confirm password does not match new password",
    "string.empty": "Please confirm your new password",
    "any.required": "Confirm password is required",
  }),
});

export const updateOrganizationSchema = joi.object({
  name: joi.string().min(2).max(100).trim().required().messages({
    "string.min": "Organization name must be at least 2 characters",
    "string.empty": "Organization name is required",
    "any.required": "Organization name is required",
  }),
  currency: joi
    .object({
      code: joi.string().max(10).trim().uppercase().optional(),
      symbol: joi.string().max(10).trim().optional(),
    })
    .optional(),
  currencyCode: joi.string().max(10).trim().uppercase().optional(),
  currencySymbol: joi.string().max(10).trim().optional(),
});
