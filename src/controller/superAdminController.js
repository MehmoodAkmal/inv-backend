import mongoose from "mongoose";
import joi from "joi";
import Organization from "../Schemas/organiztion.js";
import User from "../Schemas/auth.js";
import Branch from "../Schemas/branch.js";
import Sale from "../Schemas/sale.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// Day boundaries in UTC
const dayStart = (iso) => new Date(`${iso}T00:00:00.000Z`);
const dayEnd   = (iso) => new Date(`${iso}T23:59:59.999Z`);

// ── 1. getPlatformStats ────────────────────────────────────────────────────
// GET /admin/stats — superAdmin only
export const getPlatformStats = async (req, res) => {
    try {
        const now       = new Date();
        const monthStr  = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const monthStart = dayStart(`${monthStr}-01`);

        const [
            totalOrganizations,
            activeOrganizations,
            suspendedOrganizations,
            newOrganizationsThisMonth,
            totalUsers,
            totalBranches,
        ] = await Promise.all([
            Organization.countDocuments({}),
            Organization.countDocuments({ isActive: true }),
            Organization.countDocuments({ isActive: false }),
            Organization.countDocuments({ createdAt: { $gte: monthStart } }),
            // Exclude superAdmin accounts from the user count — they are
            // platform operators, not tenant users
            User.countDocuments({ role: { $ne: "superAdmin" } }),
            Branch.countDocuments({}),
        ]);

        return res.status(200).json({
            success: true,
            message: "Platform stats fetched",
            data: {
                totalOrganizations,
                activeOrganizations,
                suspendedOrganizations,
                newOrganizationsThisMonth,
                totalUsers,
                totalBranches,
            },
        });
    } catch (err) {
        console.error("getPlatformStats error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 2. getOrganizations ────────────────────────────────────────────────────
// GET /admin/organizations — superAdmin only, paginated + filtered
export const getOrganizations = async (req, res) => {
    try {
        const {
            search, status, plan,
            page  = 1,
            limit = 20,
            sortBy = "newest",
        } = req.query;

        const pageNum  = Math.max(1, parseInt(page,  10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
        const skip     = (pageNum - 1) * limitNum;

        // ── Build match stage ──────────────────────────────────────────────
        const match = {};
        if (search) {
            match.name = { $regex: search, $options: "i" };
        }
        if (status === "active")    match.isActive = true;
        if (status === "suspended") match.isActive = false;
        if (plan && ["free","basic","pro"].includes(plan)) {
            match.subscriptionPlan = plan;
        }

        // ── Sort stage ─────────────────────────────────────────────────────
        const sortMap = {
            newest:  { createdAt: -1 },
            oldest:  { createdAt:  1 },
            name:    { name:       1 },
        };
        const sort = sortMap[sortBy] ?? sortMap.newest;

        // ── Aggregation — single round-trip for org + counts ───────────────
        // Privacy rule: only meta counts, never business data
        const [result] = await Organization.aggregate([
            { $match: match },
            { $sort: sort },
            { $facet: {
                data: [
                    { $skip: skip },
                    { $limit: limitNum },
                    // Branch count per org
                    { $lookup: {
                        from: "branches",
                        let:  { orgId: "$_id" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$organizationId", "$$orgId"] } } },
                            { $count: "n" },
                        ],
                        as: "branchAgg",
                    }},
                    // User count per org (excluding superAdmin role globally)
                    { $lookup: {
                        from: "users",
                        let:  { orgId: "$_id" },
                        pipeline: [
                            { $match: { $expr: {
                                $and: [
                                    { $eq: ["$organizationId", "$$orgId"] },
                                    { $ne: ["$role", "superAdmin"] },
                                ],
                            }}},
                            { $count: "n" },
                        ],
                        as: "userAgg",
                    }},
                    { $project: {
                        name:               1,
                        isActive:           1,
                        subscriptionPlan:   1,
                        subscriptionStatus: 1,
                        maxBranches:        1,
                        createdAt:          1,
                        branchCount: { $ifNull: [{ $arrayElemAt: ["$branchAgg.n", 0] }, 0] },
                        userCount:   { $ifNull: [{ $arrayElemAt: ["$userAgg.n",   0] }, 0] },
                    }},
                ],
                total: [
                    { $count: "n" },
                ],
            }},
        ]);

        const organizations = result?.data  ?? [];
        const total         = result?.total[0]?.n ?? 0;

        return res.status(200).json({
            success: true,
            message: "Organizations fetched",
            data:    organizations,
            pagination: {
                total,
                page:       pageNum,
                limit:      limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        console.error("getOrganizations error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 3. getOrganizationDetail ───────────────────────────────────────────────
// GET /admin/organizations/:id — superAdmin only
// PRIVACY: returns meta-info only — no Sale, Customer, Item, Stock, Expense,
// or SalaryPayment data of any kind.
export const getOrganizationDetail = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return fail(res, 400, "Invalid organization ID");
        }

        const org = await Organization.findById(id).lean();
        if (!org) return fail(res, 404, "Organization not found");

        const [branches, users] = await Promise.all([
            // Branches: name + status only — no address or financial data
            Branch.find({ organizationId: id })
                .select("name isActive createdAt")
                .sort({ createdAt: -1 })
                .lean(),
            // Users: identity + role only — password is select:false on schema
            // so it won't appear, but we also explicitly exclude it just in case
            User.find({ organizationId: id, role: { $ne: "superAdmin" } })
                .select("firstName lastName email role isActive branchId createdAt")
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        return res.status(200).json({
            success: true,
            message: "Organization detail fetched",
            data: {
                // Organization meta
                _id:                org._id,
                name:               org.name,
                isActive:           org.isActive,
                subscriptionPlan:   org.subscriptionPlan,
                subscriptionStatus: org.subscriptionStatus,
                maxBranches:        org.maxBranches,
                createdAt:          org.createdAt,
                updatedAt:          org.updatedAt,
                // Counts
                branchCount: branches.length,
                userCount:   users.length,
                // Meta lists (no business data)
                branches,
                users,
            },
        });
    } catch (err) {
        console.error("getOrganizationDetail error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 4. toggleOrganizationStatus ────────────────────────────────────────────
// PATCH /admin/organizations/:id/toggle-status — superAdmin only
// NOTE: The authentication middleware checks Organization.isActive for every
// non-superAdmin request. Flipping isActive to false here will immediately
// prevent users of the suspended org from authenticating on their next request.
// No additional work is needed to "kick out" currently active sessions since
// JWTs are stateless — existing tokens remain valid until expiry. To revoke
// sessions immediately, implement a token blocklist in Redis.
export const toggleOrganizationStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return fail(res, 400, "Invalid organization ID");
        }

        const org = await Organization.findById(id);
        if (!org) return fail(res, 404, "Organization not found");

        org.isActive = !org.isActive;
        await org.save();

        const action = org.isActive ? "reactivated" : "suspended";

        return res.status(200).json({
            success: true,
            message: `Organization ${action} successfully`,
            data: {
                _id:      org._id,
                name:     org.name,
                isActive: org.isActive,
            },
        });
    } catch (err) {
        console.error("toggleOrganizationStatus error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 5. updateOrganizationPlan ──────────────────────────────────────────────
// PATCH /admin/organizations/:id/plan — superAdmin only
const updatePlanSchema = joi.object({
    subscriptionPlan: joi.string().valid("free", "basic", "pro").required(),
    maxBranches:      joi.number().integer().min(1).required(),
});

export const updateOrganizationPlan = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return fail(res, 400, "Invalid organization ID");
        }

        const { error, value } = updatePlanSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const org = await Organization.findByIdAndUpdate(
            id,
            { $set: { subscriptionPlan: value.subscriptionPlan, maxBranches: value.maxBranches } },
            { new: true, runValidators: true }
        );
        if (!org) return fail(res, 404, "Organization not found");

        return res.status(200).json({
            success: true,
            message: "Organization plan updated",
            data: {
                _id:              org._id,
                name:             org.name,
                subscriptionPlan: org.subscriptionPlan,
                maxBranches:      org.maxBranches,
            },
        });
    } catch (err) {
        console.error("updateOrganizationPlan error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 6. getSignupTrend ──────────────────────────────────────────────────────
// GET /admin/signup-trend — superAdmin only
export const getSignupTrend = async (req, res) => {
    try {
        const days     = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
        const now      = new Date();
        const cutoff   = new Date(now);
        cutoff.setDate(cutoff.getDate() - (days - 1));
        cutoff.setUTCHours(0, 0, 0, 0);

        // Aggregate organizations grouped by signup day
        const raw = await Organization.aggregate([
            { $match: { createdAt: { $gte: cutoff } } },
            { $group: {
                _id:   { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
                count: { $sum: 1 },
            }},
            { $sort: { "_id": 1 } },
        ]);

        // Build a lookup map then fill every day in the range with 0 if absent
        const rawMap = Object.fromEntries(raw.map((r) => [r._id, r.count]));
        const trend  = Array.from({ length: days }, (_, i) => {
            const d   = new Date(cutoff);
            d.setDate(d.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            return { date: key, count: rawMap[key] ?? 0 };
        });

        return res.status(200).json({
            success: true,
            message: "Signup trend fetched",
            data:    trend,
        });
    } catch (err) {
        console.error("getSignupTrend error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 7. getMostActiveOrganizations ─────────────────────────────────────────
// GET /admin/active-organizations — superAdmin only
// PRIVACY: returns saleCount (a count) only — no monetary amounts,
// customer names, item names, or any other business content.
export const getMostActiveOrganizations = async (req, res) => {
    try {
        const days  = Math.min(365, Math.max(1, parseInt(req.query.days,  10) || 30));
        const limit = Math.min(50,  Math.max(1, parseInt(req.query.limit, 10) || 10));

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        cutoff.setUTCHours(0, 0, 0, 0);

        const results = await Sale.aggregate([
            { $match: { createdAt: { $gte: cutoff } } },

            // COUNT only — never sum or expose totalAmount per the privacy rule
            { $group: {
                _id:       "$organizationId",
                saleCount: { $sum: 1 },
            }},

            { $sort: { saleCount: -1 } },
            { $limit: limit },

            // Join organization name (meta-info only)
            { $lookup: {
                from:         "organizations",
                localField:   "_id",
                foreignField: "_id",
                as:           "org",
            }},
            { $unwind: { path: "$org", preserveNullAndEmptyArrays: true } },

            { $project: {
                _id:              0,
                organizationId:   "$_id",
                organizationName: "$org.name",
                saleCount:        1,
                // Explicitly exclude anything that could be business data
            }},
        ]);

        return res.status(200).json({
            success: true,
            message: "Most active organizations fetched",
            data:    results,
        });
    } catch (err) {
        console.error("getMostActiveOrganizations error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 8. getAllUsers ─────────────────────────────────────────────────────────
// GET /admin/users — superAdmin only
// Returns all non-superAdmin users across every organization.
// PRIVACY: identity fields only — no business data.
export const getAllUsers = async (req, res) => {
    try {
        const {
            search,
            role,
            status,
            organizationId,
            page  = 1,
            limit = 20,
        } = req.query;

        const pageNum  = Math.max(1, parseInt(page,  10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
        const skip     = (pageNum - 1) * limitNum;

        const match = { role: { $ne: "superAdmin" } };

        if (search) {
            const rx = { $regex: search, $options: "i" };
            match.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
        }
        if (role && ["admin","manager","cashier"].includes(role)) {
            match.role = role;
        }
        if (status === "active")   match.isActive = true;
        if (status === "inactive") match.isActive = false;
        if (organizationId && mongoose.isValidObjectId(organizationId)) {
            match.organizationId = new mongoose.Types.ObjectId(organizationId);
        }

        const [result] = await User.aggregate([
            { $match: match },
            { $sort: { createdAt: -1 } },
            { $facet: {
                data: [
                    { $skip: skip },
                    { $limit: limitNum },
                    // Join organization name
                    { $lookup: {
                        from: "organizations",
                        localField: "organizationId",
                        foreignField: "_id",
                        as: "org",
                    }},
                    { $project: {
                        firstName:      1,
                        lastName:       1,
                        email:          1,
                        role:           1,
                        isActive:       1,
                        organizationId: 1,
                        branchId:       1,
                        createdAt:      1,
                        organizationName: { $ifNull: [{ $arrayElemAt: ["$org.name", 0] }, "—"] },
                    }},
                ],
                total: [{ $count: "n" }],
            }},
        ]);

        const users = result?.data        ?? [];
        const total = result?.total[0]?.n ?? 0;

        return res.status(200).json({
            success: true,
            message: "Users fetched",
            data:    users,
            pagination: {
                total,
                page:       pageNum,
                limit:      limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        console.error("getAllUsers error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
