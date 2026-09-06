import Permission from "../Schemas/permission.js";
import { resolvePermissions } from "../utils/permissionDefaults.js";

/**
 * checkPermission(module, action)
 *
 * Middleware factory that checks if the current user has a specific permission.
 * Resolution order: userOverride → orgRoleDefault → systemDefault
 *
 * admin and superAdmin always pass through.
 * Only manager and cashier are permission-checked.
 *
 * Usage:
 *   router.get("/sales", authentication, checkPermission("sales", "view"), getSales);
 */
export const checkPermission = (module, action) => async (req, res, next) => {
    try {
        const { role, id: userId, organizationId } = req.user;

        // admin and superAdmin bypass the permission system entirely
        if (role === "admin" || role === "superAdmin") return next();

        // Fetch both role-default and user-override in parallel
        const [roleDefault, userOverride] = await Promise.all([
            Permission.findOne({ organizationId, role, userId: null }).lean(),
            Permission.findOne({ organizationId, role, userId }).lean(),
        ]);

        const perms = resolvePermissions(role, roleDefault, userOverride);

        // Navigate the nested permission object: perms[module][action]
        const allowed = perms?.[module]?.[action] ?? false;

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: `You do not have permission to ${action} ${module}`,
            });
        }

        // Attach resolved permissions to req for potential downstream use
        req.permissions = perms;
        next();
    } catch (err) {
        console.error("checkPermission error:", err);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};
