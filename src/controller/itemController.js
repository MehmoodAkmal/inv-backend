import Item from "../Schemas/item.js";
import Category from "../Schemas/category.js";
import { createItemSchema, updateItemSchema } from "../validation/item.js";

/**
 * Auto-generate a unique, human-friendly SKU for an organization item.
 * Format examples:
 *   "Daal Mash" -> DM-01, DM-02...
 *   "Rice (Super)" -> RS-01...
 *   "Sugar" -> SUG-01...
 * Guaranteed to be unique within the organization.
 */
export const generateItemSku = async (organizationId, itemName, categoryName) => {
    let prefix = "";
    const cleanName = (itemName || "").replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    const words = cleanName.split(/\s+/).filter(Boolean);

    if (words.length >= 2) {
        prefix = words.slice(0, 4).map((w) => w[0].toUpperCase()).join("");
    } else if (words.length === 1 && words[0].length >= 2) {
        prefix = words[0].slice(0, 3).toUpperCase();
    }

    if (prefix.length < 2 && categoryName) {
        const cleanCat = categoryName.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
        const catWords = cleanCat.split(/\s+/).filter(Boolean);
        if (catWords.length >= 2) {
            prefix = catWords.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
        } else if (catWords.length === 1 && catWords[0].length >= 2) {
            prefix = catWords[0].slice(0, 3).toUpperCase();
        }
    }

    if (prefix.length < 2) {
        prefix = "ITM";
    }

    // Find all existing SKUs matching prefix-number in this organization
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escapedPrefix}-(\\d+)$`, "i");

    const existingItems = await Item.find({
        organizationId,
        sku: { $regex: regex },
    }).select("sku").lean();

    const usedNumbers = new Set();
    for (const item of existingItems) {
        if (!item.sku) continue;
        const match = item.sku.match(regex);
        if (match && match[1]) {
            usedNumbers.add(parseInt(match[1], 10));
        }
    }

    let num = 1;
    while (usedNumbers.has(num)) {
        num++;
    }

    const formattedNum = String(num).padStart(2, "0");
    let candidateSku = `${prefix}-${formattedNum}`;

    // Double check against exact match
    let safetyCounter = num;
    while (await Item.exists({ organizationId, sku: candidateSku })) {
        safetyCounter++;
        candidateSku = `${prefix}-${String(safetyCounter).padStart(2, "0")}`;
    }

    return candidateSku;
};

// GET /items/generate-sku — admin, manager, cashier
export const getNextSku = async (req, res) => {
    try {
        const organizationId = req.user.organizationId;
        const { name, categoryId } = req.query;

        let categoryName = "";
        if (categoryId) {
            const cat = await Category.findOne({ _id: categoryId, organizationId }).select("name").lean();
            if (cat) categoryName = cat.name;
        }

        const sku = await generateItemSku(organizationId, name, categoryName);

        return res.status(200).json({
            success: true,
            message: "SKU generated successfully",
            data: { sku },
        });
    } catch (error) {
        console.error("getNextSku error:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

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

        let sku = value.sku ? value.sku.trim().toUpperCase() : "";

        if (sku) {
            const existingSku = await Item.findOne({ organizationId, sku });
            if (existingSku) {
                return res.status(400).json({
                    success: false,
                    message: `SKU "${sku}" is already in use by item "${existingSku.name}". Please enter a unique SKU.`,
                });
            }
        } else {
            sku = await generateItemSku(organizationId, value.name, category.name);
        }

        const item = await Item.create({
            ...value,
            sku,
            organizationId,
        });

        return res.status(201).json({
            success: true,
            message: "Item created successfully",
            data: item,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "An item with this SKU already exists in your organization.",
            });
        }
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

        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: "i" } },
                { sku:  { $regex: req.query.search, $options: "i" } },
            ];
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

        if (value.sku) {
            const sku = value.sku.trim().toUpperCase();
            const existingSku = await Item.findOne({ organizationId, sku, _id: { $ne: id } });
            if (existingSku) {
                return res.status(400).json({
                    success: false,
                    message: `SKU "${sku}" is already in use by item "${existingSku.name}". Please enter a unique SKU.`,
                });
            }
            value.sku = sku;
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
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "An item with this SKU already exists in your organization.",
            });
        }
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
