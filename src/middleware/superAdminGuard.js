/**
 * superAdminGuard.js
 * 
 * Strict middleware guard for platform superAdmin endpoints.
 * 
 * Features:
 * 1. Verifies authentication and confirms role === "superAdmin".
 * 2. If SUPERADMIN_SECRET is set in the environment, verifies the x-admin-secret header.
 * 3. Logs an audit trail for every superAdmin request (timestamp, admin ID, IP, method, path).
 */

export const superAdminGuard = (req, res, next) => {
    try {
        if (!req.user || req.user.role !== "superAdmin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. SuperAdmin privileges required.",
            });
        }

        // Optional secondary secret header check (if configured in env)
        const requiredSecret = process.env.SUPERADMIN_SECRET;
        if (requiredSecret) {
            const clientSecret = req.headers["x-admin-secret"];
            if (!clientSecret || clientSecret !== requiredSecret) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied. Invalid or missing administrator secret key.",
                });
            }
        }

        // Audit logging
        const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
        console.info(
            `[SUPERADMIN AUDIT] ${new Date().toISOString()} | AdminId: ${req.user.id} | IP: ${clientIp} | ${req.method} ${req.originalUrl}`
        );

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "SuperAdmin security check error: " + error.message,
        });
    }
};
