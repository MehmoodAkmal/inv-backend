import User from "../Schemas/auth.js";
import Branch from "../Schemas/branch.js";
import Organization from "../Schemas/organization.js";
import Employee from "../Schemas/employee.js";
import {
  updateProfileSchema,
  changePasswordSchema,
  updateOrganizationSchema,
} from "../validation/account.js";

/**
 * GET /account/profile
 * Retrieves full profile details for the authenticated user,
 * including linked branch, organization, and employee metadata if applicable.
 */
export const getAccountProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    const [branch, organization, employee] = await Promise.all([
      user.branchId ? Branch.findById(user.branchId).lean() : null,
      user.organizationId ? Organization.findById(user.organizationId).lean() : null,
      Employee.findOne({
        $or: [
          { userId: user._id },
          ...(user.organizationId ? [{ organizationId: user.organizationId, name: `${user.firstName} ${user.lastName}`.trim() }] : [])
        ]
      }).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone || null,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        branch: branch
          ? {
              id: branch._id,
              name: branch.name,
              address: branch.address,
              phone: branch.phone,
              city: branch.city,
            }
          : null,
        organization: organization
          ? {
              id: organization._id,
              name: organization.name,
              currency: organization.currency || { code: "PKR", symbol: "Rs." },
              subscriptionPlan: organization.subscriptionPlan,
              subscriptionStatus: organization.subscriptionStatus,
              maxBranches: organization.maxBranches,
            }
          : null,
        employee: employee
          ? {
              id: employee._id,
              designation: employee.designation,
              phone: employee.phone,
              monthlySalary: employee.monthlySalary,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("getAccountProfile error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch account profile" });
  }
};

/**
 * PUT /account/profile
 * Updates the user's first name, last name, email, and phone.
 * Synchronizes linked employee records and returns the updated user context.
 */
export const updateAccountProfile = async (req, res) => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const { firstName, lastName, email, phone } = value;

    // Duplicate email verification across accounts
    const existing = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.user.id },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "This email address is already in use by another account.",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.email = email.toLowerCase();
    user.phone = phone ? phone.trim() : null;
    await user.save();

    // Synchronize linked employee name and phone if one exists
    try {
      await Employee.updateMany(
        { userId: user._id },
        {
          name: `${firstName} ${lastName}`.trim(),
          ...(phone ? { phone: phone.trim() } : {}),
        }
      );
    } catch (empErr) {
      console.warn("updateAccountProfile: sync with employee record failed:", empErr.message);
    }

    const org = user.organizationId
      ? await Organization.findById(user.organizationId).lean()
      : null;
    const currency = org?.currency || { code: "PKR", symbol: "Rs." };

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        organizationId: user.organizationId,
        branchId: user.branchId,
        currency: currency,
      },
    });
  } catch (error) {
    console.error("updateAccountProfile error:", error);
    return res.status(500).json({ success: false, message: "Failed to update account profile" });
  }
};

/**
 * PUT /account/change-password
 * Safely changes the user's password after verifying their current password.
 */
export const changePassword = async (req, res) => {
  try {
    const { error, value } = changePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const { currentPassword, newPassword } = value;

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password does not match. Please verify and try again.",
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. You can now use your new password.",
    });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

/**
 * PUT /account/organization
 * Admin-only endpoint to update organization details (name, currency code & symbol).
 */
export const updateOrganizationSettings = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only organization administrators can update organization settings.",
      });
    }

    if (!req.user.organizationId) {
      return res.status(400).json({
        success: false,
        message: "No organization associated with this account.",
      });
    }

    const { error, value } = updateOrganizationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const { name, currency, currencyCode, currencySymbol } = value;
    const resolvedCurrency = {
      code: (currency?.code || currencyCode || "PKR").toUpperCase().trim(),
      symbol: (currency?.symbol || currencySymbol || "Rs.").trim(),
    };

    const updatedOrg = await Organization.findByIdAndUpdate(
      req.user.organizationId,
      {
        name: name.trim(),
        currency: resolvedCurrency,
      },
      { new: true }
    ).lean();

    if (!updatedOrg) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Organization settings updated successfully",
      organization: {
        id: updatedOrg._id,
        name: updatedOrg.name,
        currency: updatedOrg.currency,
        subscriptionPlan: updatedOrg.subscriptionPlan,
        subscriptionStatus: updatedOrg.subscriptionStatus,
        maxBranches: updatedOrg.maxBranches,
      },
    });
  } catch (error) {
    console.error("updateOrganizationSettings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update organization settings",
    });
  }
};
