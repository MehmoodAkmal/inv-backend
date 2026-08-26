import Category from "../Schemas/category.js";
import { createCategorySchema, updateCategorySchema } from "../validation/category.js";

// POST /categories — admin only
export const createCategory = async (req, res) => {
    try {
        const { error, value } = createCategorySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const organizationId = req.user.organizationId;

        const category = await Category.create({ organizationId, name: value.name });

        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: category,
        });
    } catch (error) {
        // Duplicate key — same org already has a category with this name
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists in your organization",
            });
        }
        console.error("createCategory error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// GET /categories — admin + manager
// ?includeInactive=true  shows soft-deleted categories too
export const getCategories = async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const filter = { organizationId };

        if (req.query.includeInactive !== "true") {
            filter.isActive = true;
        }

        const categories = await Category.find(filter).sort({ name: 1 });

        return res.status(200).json({
            success: true,
            message: "Categories fetched successfully",
            data: categories,
        });
    } catch (error) {
        console.error("getCategories error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// PUT /categories/:id — admin only
export const updateCategory = async (req, res) => {
    try {
        const { error, value } = updateCategorySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const { id } = req.params;
        const organizationId = req.user.organizationId;

        // Ownership check — 404 regardless of cross-org existence
        const category = await Category.findOne({ _id: id, organizationId });
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        const updated = await Category.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: updated,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists in your organization",
            });
        }
        console.error("updateCategory error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// DELETE /categories/:id — admin only (soft delete)
export const deactivateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const organizationId = req.user.organizationId;

        const category = await Category.findOne({ _id: id, organizationId });
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        if (!category.isActive) {
            return res.status(400).json({ success: false, message: "Category is already inactive" });
        }

        await Category.findByIdAndUpdate(id, { $set: { isActive: false } });

        return res.status(200).json({
            success: true,
            message: "Category deactivated successfully",
            data: null,
        });
    } catch (error) {
        console.error("deactivateCategory error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};
