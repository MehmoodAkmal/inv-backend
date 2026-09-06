import Branch from "../Schemas/branch.js";
import Organization from "../Schemas/organization.js";
import { createBranchSchema, updateBranchSchema } from "../validation/branch.js";

// POST /branches — admin only
export const createBranch = async (req, res) => {
    try {
        const { error, value } = createBranchSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        const { name, address } = value;
        const organizationId = req.user.organizationId;

        // Enforce per-plan branch limit
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: "Organization not found",
            });
        }

        const activeBranchCount = await Branch.countDocuments({
            organizationId,
            isActive: true,
        });

        if (activeBranchCount >= organization.maxBranches) {
            return res.status(403).json({
                success: false,
                message: "Branch limit reached for your plan",
            });
        }

        const branch = await Branch.create({
            organizationId,
            name,
            ...(address !== undefined && { address }),
        });

        return res.status(201).json({
            success: true,
            message: "Branch created successfully",
            data: branch,
        });
    } catch (error) {
        console.error("createBranch error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};

// GET /branches — admin (own org only) or superAdmin (any org via ?organizationId=)
export const getBranches = async (req, res) => {
    try {
        let organizationId;

        if (req.user.role === "superAdmin") {
            // superAdmin can inspect any org; falls back to their own (null) if not provided
            organizationId = req.query.organizationId || req.user.organizationId;
        } else {
            // admin is always scoped to their own org — ignore any query param they pass
            organizationId = req.user.organizationId;
        }

        const filter = { organizationId };

        // Include inactive branches only when explicitly requested
        if (req.query.includeInactive !== "true") {
            filter.isActive = true;
        }

        const branches = await Branch.find(filter).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Branches fetched successfully",
            data: branches,
        });
    } catch (error) {
        console.error("getBranches error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};

// GET /branches/:id — any authenticated user can view their own branch
export const getBranchById = async (req, res) => {
    try {
        const { id } = req.params;
        const { organizationId, role, branchId } = req.user;
        const filter = { _id: id, organizationId };
        const branch = await Branch.findOne(filter);
        if (!branch) {
            return res.status(404).json({ success: false, message: "Branch not found" });
        }
        if (role !== "admin" && role !== "superAdmin" && branch._id.toString() !== branchId.toString()) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }
        return res.status(200).json({ success: true, data: branch });
    } catch (error) {
        console.error("getBranchById error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// PUT /branches/:id — admin only
export const updateBranch = async (req, res) => {
    try {
        const { error, value } = updateBranchSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        const { id } = req.params;
        const organizationId = req.user.organizationId;

        // Ownership check — return 404 regardless of whether the branch exists in
        // another org, so we never leak the existence of other orgs' branches
        const branch = await Branch.findOne({ _id: id, organizationId });
        if (!branch) {
            return res.status(404).json({
                success: false,
                message: "Branch not found",
            });
        }

        const updatedBranch = await Branch.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Branch updated successfully",
            data: updatedBranch,
        });
    } catch (error) {
        console.error("updateBranch error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};

// DELETE /branches/:id — admin only (soft delete)
export const deactivateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const organizationId = req.user.organizationId;

        // Same ownership check — 404 for not found or wrong org
        const branch = await Branch.findOne({ _id: id, organizationId });
        if (!branch) {
            return res.status(404).json({
                success: false,
                message: "Branch not found",
            });
        }

        if (!branch.isActive) {
            return res.status(400).json({
                success: false,
                message: "Branch is already inactive",
            });
        }

        await Branch.findByIdAndUpdate(id, { $set: { isActive: false } });

        return res.status(200).json({
            success: true,
            message: "Branch deactivated successfully",
            data: null,
        });
    } catch (error) {
        console.error("deactivateBranch error:", error);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
        });
    }
};
