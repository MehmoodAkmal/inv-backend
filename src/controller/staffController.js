import User from "../Schemas/auth.js";
import Branch from "../Schemas/branch.js";
import Employee from "../Schemas/employee.js";
import { createStaffSchema, updateStaffSchema } from "../validation/auth.js";

// Safe fields to return — never expose password
const SAFE_FIELDS = "firstName lastName email role isActive branchId organizationId createdAt updatedAt";

// Staff roles that an admin is allowed to manage
const STAFF_ROLES = ["manager", "cashier"];

// Human-readable designation for each role
const ROLE_DESIGNATION = {
    manager: "Branch Manager",
    cashier: "Cashier (Point of Sale)",
};

// POST /staff — admin only
export const createStaff = async (req, res) => {
    try {
        const { error, value } = createStaffSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        const { firstName, lastName, email, password, role, branchId } = value;
        const organizationId = req.user.organizationId; // always from token, never body

        // Verify the branch exists, belongs to this org, and is active
        const branch = await Branch.findOne({
            _id: branchId,
            organizationId,
            isActive: true,
        });
        if (!branch) {
            return res.status(400).json({
                success: false,
                message: "Invalid branch",
            });
        }

        // Case-insensitive duplicate check — email is stored lowercase by the schema
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already exists",
            });
        }

        // Create user — plain password, pre-save hook hashes it
        const newUser = await User.create({
            firstName,
            lastName,
            email,
            password,
            role,
            branchId,
            organizationId,
        });

        // ── Auto-create a linked Employee record ──────────────────────────
        // Salary defaults to 0; admin should edit it in the Employees page.
        // This runs after User.create so a failure here doesn't block the user.
        try {
            await Employee.create({
                organizationId,
                branchId,
                userId:        newUser._id,
                name:          `${firstName} ${lastName}`.trim(),
                designation:   ROLE_DESIGNATION[role] || role,
                monthlySalary: 0,
                phone:         null,
            });
        } catch (empErr) {
            // Log but do not fail — admin can add employee manually if needed
            console.error("createStaff: auto-create employee failed:", empErr.message);
        }

        return res.status(201).json({
            success: true,
            message: "Staff member created successfully",
            data: {
                id: newUser._id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role,
                isActive: newUser.isActive,
                branchId: newUser.branchId,
                organizationId: newUser.organizationId,
            },
        });
    } catch (error) {
        console.error("createStaff error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};

// GET /staff — admin only
export const getStaff = async (req, res) => {
    try {
        const organizationId = req.user.organizationId;

        // Base filter — always scoped to this org, always limited to staff roles
        const filter = {
            organizationId,
            role: { $in: STAFF_ROLES },
        };

        // Optional branch filter — AND-ed with organizationId, never replaces it
        if (req.query.branchId) {
            filter.branchId = req.query.branchId;
        }

        const staff = await User.find(filter)
            .select(SAFE_FIELDS)
            .populate("branchId", "name")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Staff fetched successfully",
            data: staff,
        });
    } catch (error) {
        console.error("getStaff error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};

// PUT /staff/:id — admin only
export const updateStaff = async (req, res) => {
    try {
        const { error, value } = updateStaffSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        const { id } = req.params;
        const organizationId = req.user.organizationId;

        // Ownership + role guard — 404 for both not-found and wrong-org/role
        // so we never leak the existence of other orgs' users or admins
        const target = await User.findOne({
            _id: id,
            organizationId,
            role: { $in: STAFF_ROLES },
        });
        if (!target) {
            return res.status(404).json({
                success: false,
                message: "Staff member not found",
            });
        }

        // If branchId is changing, verify the new branch belongs to the same org
        if (value.branchId) {
            const branch = await Branch.findOne({
                _id: value.branchId,
                organizationId,
                isActive: true,
            });
            if (!branch) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid branch",
                });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        ).select(SAFE_FIELDS);

        return res.status(200).json({
            success: true,
            message: "Staff member updated successfully",
            data: updatedUser,
        });
    } catch (error) {
        console.error("updateStaff error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};

// DELETE /staff/:id — admin only (soft delete)
export const deactivateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const organizationId = req.user.organizationId;

        // Same ownership + role guard as updateStaff
        const target = await User.findOne({
            _id: id,
            organizationId,
            role: { $in: STAFF_ROLES },
        });
        if (!target) {
            return res.status(404).json({
                success: false,
                message: "Staff member not found",
            });
        }

        if (!target.isActive) {
            return res.status(400).json({
                success: false,
                message: "Staff member is already deactivated",
            });
        }

        await User.findByIdAndUpdate(id, { $set: { isActive: false } });

        return res.status(200).json({
            success: true,
            message: "Staff member deactivated successfully",
            data: null,
        });
    } catch (error) {
        console.error("deactivateStaff error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};
