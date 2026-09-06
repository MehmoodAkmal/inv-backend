import Permission from "../Schemas/permission.js";
import User from "../Schemas/auth.js";
import {
    PERMISSION_CATALOG,
    resolvePermissions,
    sanitizePermissions,
} from "../utils/permissionDefaults.js";

const STAFF_ROLES = ["manager", "cashier"];

const validRole = (role) => STAFF_ROLES.includes(role);

async function getUserInOrganization(id, organizationId) {
    return User.findOne({ _id: id, organizationId, role: { $in: STAFF_ROLES } })
        .select("_id firstName lastName role")
        .lean();
}

// GET /permissions/me — current staff member's resolved permissions
export const getMyPermissions = async (req, res) => {
    try {
        const { role, id: userId, organizationId } = req.user;
        if (!STAFF_ROLES.includes(role)) {
            return res.json({ success: true, data: { permissions: null, catalog: PERMISSION_CATALOG } });
        }
        const [roleDefault, userOverride] = await Promise.all([
            Permission.findOne({ organizationId, role, userId: null }).lean(),
            Permission.findOne({ organizationId, role, userId }).lean(),
        ]);
        return res.json({ success: true, data: {
            permissions: resolvePermissions(role, roleDefault, userOverride),
            catalog: PERMISSION_CATALOG,
        }});
    } catch (error) {
        console.error("getMyPermissions error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// GET /permissions/roles/:role — resolved permission set for an org role
export const getRolePermissions = async (req, res) => {
    try {
        const { role } = req.params;
        if (!validRole(role)) return res.status(400).json({ success: false, message: "Invalid staff role" });

        const roleDefault = await Permission.findOne({ organizationId: req.user.organizationId, role, userId: null }).lean();
        return res.json({ success: true, data: {
            role,
            permissions: resolvePermissions(role, roleDefault, null),
            hasCustomDefault: Boolean(roleDefault),
            catalog: PERMISSION_CATALOG,
        }});
    } catch (error) {
        console.error("getRolePermissions error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// PUT /permissions/roles/:role — replaces the org-level role default
export const updateRolePermissions = async (req, res) => {
    try {
        const { role } = req.params;
        if (!validRole(role)) return res.status(400).json({ success: false, message: "Invalid staff role" });
        if (!req.body?.permissions || typeof req.body.permissions !== "object") {
            return res.status(400).json({ success: false, message: "permissions is required" });
        }

        const permissions = sanitizePermissions(req.body.permissions);
        if (Object.keys(permissions).length === 0) {
            return res.status(400).json({ success: false, message: "No valid permissions were provided" });
        }
        await Permission.findOneAndUpdate(
            { organizationId: req.user.organizationId, role, userId: null },
            { $set: { permissions } },
            { upsert: true, new: true, runValidators: true }
        );
        return res.json({ success: true, message: `${role} default permissions updated`, data: { role, permissions } });
    } catch (error) {
        console.error("updateRolePermissions error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// GET /permissions/users/:userId — resolved permissions for one staff member
export const getUserPermissions = async (req, res) => {
    try {
        const user = await getUserInOrganization(req.params.userId, req.user.organizationId);
        if (!user) return res.status(404).json({ success: false, message: "Staff member not found" });

        const [roleDefault, userOverride] = await Promise.all([
            Permission.findOne({ organizationId: req.user.organizationId, role: user.role, userId: null }).lean(),
            Permission.findOne({ organizationId: req.user.organizationId, role: user.role, userId: user._id }).lean(),
        ]);
        return res.json({ success: true, data: {
            user,
            permissions: resolvePermissions(user.role, roleDefault, userOverride),
            hasCustomPermissions: Boolean(userOverride),
            catalog: PERMISSION_CATALOG,
        }});
    } catch (error) {
        console.error("getUserPermissions error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// PUT /permissions/users/:userId — replaces this user's permission override
export const updateUserPermissions = async (req, res) => {
    try {
        const user = await getUserInOrganization(req.params.userId, req.user.organizationId);
        if (!user) return res.status(404).json({ success: false, message: "Staff member not found" });
        if (!req.body?.permissions || typeof req.body.permissions !== "object") {
            return res.status(400).json({ success: false, message: "permissions is required" });
        }

        const permissions = sanitizePermissions(req.body.permissions);
        if (Object.keys(permissions).length === 0) {
            return res.status(400).json({ success: false, message: "No valid permissions were provided" });
        }
        await Permission.findOneAndUpdate(
            { organizationId: req.user.organizationId, role: user.role, userId: user._id },
            { $set: { permissions } },
            { upsert: true, new: true, runValidators: true }
        );
        return res.json({ success: true, message: "User permissions updated", data: { permissions } });
    } catch (error) {
        console.error("updateUserPermissions error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// DELETE /permissions/users/:userId — restore inheritance from the role default
export const resetUserPermissions = async (req, res) => {
    try {
        const user = await getUserInOrganization(req.params.userId, req.user.organizationId);
        if (!user) return res.status(404).json({ success: false, message: "Staff member not found" });

        await Permission.deleteOne({ organizationId: req.user.organizationId, role: user.role, userId: user._id });
        return res.json({ success: true, message: "User permissions reset to the role default", data: null });
    } catch (error) {
        console.error("resetUserPermissions error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};
