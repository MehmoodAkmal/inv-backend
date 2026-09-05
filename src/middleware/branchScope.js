/**
 * branchScope middleware
 *
 * Sets req.allowedBranchId based on the caller's role:
 *   - admin     → null  (can access any branch in their org)
 *   - manager   → their own branchId from the JWT (locked to one branch)
 *   - cashier   → their own branchId from the JWT (locked to one branch)
 *
 * Also blocks superAdmin from reaching tenant business routes.
 * superAdmin has no organizationId, so any business query would either
 * return empty data (silent) or fail unpredictably. An explicit 403 is
 * cleaner and prevents accidental data access.
 *
 * Must be used AFTER authentication so req.user is already populated.
 */
export const branchScope = (req, res, next) => {
    const { role, branchId } = req.user;

    // superAdmin has no organizationId — block them from all tenant business routes
    if (role === "superAdmin") {
        return res.status(403).json({
            success: false,
            message: "superAdmin cannot access tenant business routes",
        });
    }

    if (role === "admin") {
        req.allowedBranchId = null; // unrestricted within their org
    } else {
        // manager / cashier are locked to the branch in their JWT
        req.allowedBranchId = branchId ?? null;
    }

    next();
};
