import Item from "../Schemas/item.js";
import Category from "../Schemas/category.js";
import { createItemSchema, updateItemSchema } from "../validation/item.js";

// POST /items — admin only
export const createItem = async (req, res) => {
    try {
        const { error, value } = createItemSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const organizationId = req.user.organizationId;

        // Verify the category belongs to this org and is active
        const category = await Category.findOne({
            _id: value.categoryId,
            organizationId,
            isActive: true,
        });
        if (!category) {
            return res.status(400).json({
                success: false,
                message: "Category not found or does not belong to your organization",
            });
        }

        const item = await Item.create({ ...value, organizationId });

        return res.status(201).json({
            success: true,
            message: "Item created successfully",
            data: item,
        });
    } catch (error) {
        console.error("createItem error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// GET /items — admin + manager
// ?categoryId=<id>        filter by category
// ?includeInactive=true   include soft-deleted items
export const getItems = async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const filter = { organizationId };

        if (req.query.includeInactive !== "true") {
            filter.isActive = true;
        }

        if (req.query.categoryId) {
            filter.categoryId = req.query.categoryId;
        }

        const items = await Item.find(filter)
            .populate("categoryId", "name")   // attach category name for display
            .sort({ name: 1 });

        return res.status(200).json({
            success: true,
            message: "Items fetched successfully",
            data: items,
        });
    } catch (error) {
        console.error("getItems error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// PUT /items/:id — admin only
export const updateItem = async (req, res) => {
    try {
        const { error, value } = updateItemSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const { id } = req.params;
        const organizationId = req.user.organizationId;

        // Ownership check
        const item = await Item.findOne({ _id: id, organizationId });
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        // If categoryId is being changed, verify the new category belongs to this org
        if (value.categoryId) {
            const category = await Category.findOne({
                _id: value.categoryId,
                organizationId,
                isActive: true,
            });
            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: "Category not found or does not belong to your organization",
                });
            }
        }

        const updated = await Item.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        ).populate("categoryId", "name");

        return res.status(200).json({
            success: true,
            message: "Item updated successfully",
            data: updated,
        });
    } catch (error) {
        console.error("updateItem error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

// DELETE /items/:id — admin only (soft delete)
export const deactivateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const organizationId = req.user.organizationId;

        const item = await Item.findOne({ _id: id, organizationId });
        if (!item) {
            return res.status(404).json({ success: false, message: "Item not found" });
        }

        if (!item.isActive) {
            return res.status(400).json({ success: false, message: "Item is already inactive" });
        }

        await Item.findByIdAndUpdate(id, { $set: { isActive: false } });

        return res.status(200).json({
            success: true,
            message: "Item deactivated successfully",
            data: null,
        });
    } catch (error) {
        console.error("deactivateItem error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};
