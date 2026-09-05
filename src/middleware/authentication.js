import jwt from "jsonwebtoken";
import Organization from "../Schemas/organiztion.js";

export const authentication = async (req, res, next) => {
    try {
        const authHead = req.headers.authorization;
        if (!authHead) {
            return res.status(400).json({ success: false, message: "Authentication token is required" });
        }

        const token = authHead.startsWith("Bearer ") ? authHead.split(" ")[1] : null;
        if (!token) {
            return res.status(400).json({ success: false, message: "Invalid authentication token" });
        }

        const decode = jwt.verify(token, process.env.ACCESS_SECRET);
        req.user = {
            id:             decode.id,
            role:           decode.role,
            organizationId: decode.organizationId,
            branchId:       decode.branchId,
        };

        // ── Organization suspension check ──────────────────────────────────
        // Skip entirely for superAdmin — they have no organizationId and are
        // never scoped to a single tenant.
        // For all other roles, verify the organization is still active.
        // NOTE: This is a per-request DB hit. If performance becomes a concern,
        // consider caching isActive in Redis or embedding it in the JWT and
        // refreshing on login. For now, correctness > micro-optimization.
        if (req.user.role !== "superAdmin" && req.user.organizationId) {
            const org = await Organization.findById(req.user.organizationId)
                .select("isActive")
                .lean();

            if (org && !org.isActive) {
                return res.status(403).json({
                    success: false,
                    message: "Your organization has been suspended. Please contact support.",
                });
            }
        }

        next();
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
