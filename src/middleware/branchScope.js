/**
 * branchScope middleware
 *
 * Sets req.allowedBranchId based on the caller's role:
 *   - admin     → null  (can access any branch in their org)
 *   - manager   → their own branchId from the JWT (locked to one branch)
 *   - cashier   → their own branchId from the JWT (locked to one branch)
 *
 * Must be used AFTER authentication so req.user is already populated.
 */
export const branchScope = (req, res, next) => {
    const { role, branchId } = req.user;

    if (role === "admin" || role === "superAdmin") {
        req.allowedBranchId = null; // unrestricted within their org
    } else {
        // manager / cashier are locked to the branch in their JWT
        req.allowedBranchId = branchId ?? null;
    }

    next();
};
