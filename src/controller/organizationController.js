import Organization from "../Schemas/organization.js";
import Branch from "../Schemas/branch.js";
import User from "../Schemas/auth.js";

const fail = (res, status, msg) => res.status(status).json({ success: false, message: msg });

// GET /organizations — superAdmin only
// Returns all organizations with their branch count and admin user info
export const getOrganizations = async (req, res) => {
    try {
        const orgs = await Organization.find().sort({ createdAt: -1 }).lean();

        // Enrich each org with branch count + admin email in one round-trip each
        const enriched = await Promise.all(orgs.map(async (org) => {
            const [branchCount, adminUser] = await Promise.all([
                Branch.countDocuments({ organizationId: org._id }),
                User.findOne({ organizationId: org._id, role: "admin" })
                    .select("firstName lastName email")
                    .lean(),
            ]);
            return { ...org, branchCount, admin: adminUser ?? null };
        }));

        return res.status(200).json({
            success: true,
            message: "Organizations fetched successfully",
            data: enriched,
        });
    } catch (err) {
        console.error("getOrganizations error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
