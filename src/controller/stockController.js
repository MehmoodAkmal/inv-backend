import mongoose from "mongoose";
import joi from "joi";
import Stock from "../Schemas/stock.js";
import StockMovement from "../Schemas/stockMovement.js";
import StockBatch from "../Schemas/stockBatch.js";
import Item from "../Schemas/item.js";
import Branch from "../Schemas/branch.js";

const objectId = () => joi.string().hex().length(24);

const addStockSchema = joi.object({
    itemId:       objectId().required(),
    branchId:     objectId().required(),
    quantity:     joi.number().positive().required(),
    costPrice:    joi.number().min(0).optional(),
    sellingPrice: joi.number().min(0).optional(),
    batchNumber:  joi.string().trim().max(50).optional().allow(""),
    note:         joi.string().max(500).optional().allow(""),
});

const movementQuerySchema = joi.object({
    itemId:   objectId().optional(),
    branchId: objectId().optional(),
    limit:    joi.number().integer().min(1).max(200).default(50),
    page:     joi.number().integer().min(1).default(1),
});

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// ── 1. addStock (purchase entry with FIFO batch tracking) ─────────────────
// POST /stock/add — admin, manager
export const addStock = async (req, res) => {
    try {
        const { error, value } = addStockSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { itemId, branchId, quantity, costPrice, sellingPrice, batchNumber, note } = value;
        const { organizationId, role, id: userId } = req.user;

        if (role === "manager") {
            const allowed = req.allowedBranchId?.toString();
            if (!allowed || allowed !== branchId) {
                return fail(res, 403, "You can only add stock to your assigned branch");
            }
        }

        const item = await Item.findOne({ _id: itemId, organizationId, isActive: true });
        if (!item) return fail(res, 400, "Invalid item");

        const branch = await Branch.findOne({ _id: branchId, organizationId, isActive: true });
        if (!branch) return fail(res, 400, "Invalid branch");

        // Determine effective cost price for this batch
        const costPriceToUse = costPrice !== undefined ? Number(costPrice) : item.costPrice;

        // Auto-generate batch code if not provided
        const batchCode = batchNumber && batchNumber.trim()
            ? batchNumber.trim().toUpperCase()
            : `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

        // Create new inventory batch (FIFO lot)
        const [batch] = await StockBatch.create([{
            organizationId,
            branchId,
            itemId,
            batchNumber:       batchCode,
            costPrice:         costPriceToUse,
            initialQuantity:   quantity,
            remainingQuantity: quantity,
            status:            "active",
            note:              note || null,
            createdBy:         userId,
        }]);

        // Find-or-create total stock document
        let stock = await Stock.findOne({ organizationId, branchId, itemId });
        if (!stock) {
            stock = await Stock.create({ organizationId, branchId, itemId, quantity: 0 });
        }

        const previousQuantity = stock.quantity;
        const newQuantity      = previousQuantity + quantity;

        stock.quantity = newQuantity;
        await stock.save();

        // Update item default cost and selling price if provided
        let priceUpdated = false;
        if (costPrice !== undefined) {
            item.costPrice = costPriceToUse;
            priceUpdated = true;
        }
        if (sellingPrice !== undefined) {
            item.sellingPrice = Number(sellingPrice);
            priceUpdated = true;
        }
        if (priceUpdated) {
            await item.save();
        }

        // Write immutable movement record
        const [movement] = await StockMovement.create([{
            organizationId,
            branchId,
            itemId,
            type:             "purchase",
            quantity,
            previousQuantity,
            newQuantity,
            refId:            batch._id,
            batchId:          batch._id,
            costPrice:        costPriceToUse,
            note:             note || null,
            createdBy:        userId,
        }]);

        return res.status(201).json({
            success: true,
            message: "Stock added successfully with batch tracking",
            data: { stock, batch, movement },
        });
    } catch (err) {
        console.error("addStock error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 2. getStockByBranch ────────────────────────────────────────────────────
// GET /stock — admin, manager, cashier
export const getStockByBranch = async (req, res) => {
    try {
        const { organizationId, role } = req.user;

        const filter = { organizationId };

        if (role === "admin") {
            if (req.query.branchId) {
                const branch = await Branch.findOne({ _id: req.query.branchId, organizationId, isActive: true });
                if (!branch) return fail(res, 400, "Invalid branch");
                filter.branchId = req.query.branchId;
            }
            // If branchId is not passed by admin, returns all stock across organization
        } else {
            const branchId = req.allowedBranchId;
            if (!branchId) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = branchId;
        }

        const stockDocs = await Stock.find(filter)
            .populate({
                path: "itemId",
                select: "name sku unit costPrice sellingPrice reorderLevel isActive categoryId",
                populate: {
                    path: "categoryId",
                    select: "name",
                },
            })
            .populate("branchId", "name")
            .sort({ updatedAt: -1 })
            .lean();

        const data = stockDocs
            .filter((s) => s.itemId)
            .map((s) => ({
                ...s,
                isLowStock: s.quantity <= (s.itemId.reorderLevel ?? 0),
            }));

        return res.status(200).json({
            success: true,
            message: "Stock fetched successfully",
            data,
        });
    } catch (err) {
        console.error("getStockByBranch error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 3. getStockMovementHistory ─────────────────────────────────────────────
// GET /stock/movements — admin, manager
export const getStockMovementHistory = async (req, res) => {
    try {
        const { organizationId, role } = req.user;

        const { error, value } = movementQuerySchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { limit, page } = value;
        const skip = (page - 1) * limit;
        const filter = { organizationId };

        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        } else if (value.branchId) {
            filter.branchId = value.branchId;
        }

        if (value.itemId) filter.itemId = value.itemId;

        const [movements, total] = await Promise.all([
            StockMovement.find(filter)
                .populate("itemId",    "name sku unit")
                .populate("branchId",  "name")
                .populate("createdBy", "firstName lastName")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            StockMovement.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            message: "Stock movement history fetched successfully",
            data:    movements,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error("getStockMovementHistory error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 4. getStockBatches ─────────────────────────────────────────────────────
// GET /stock/batches — admin, manager, cashier
export const getStockBatches = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const { itemId, branchId, status } = req.query;

        const filter = { organizationId };
        if (itemId) filter.itemId = itemId;
        if (branchId) filter.branchId = branchId;
        if (status) filter.status = status;
        else filter.status = "active";

        if (role === "manager") {
            const allowed = req.allowedBranchId?.toString();
            if (allowed) filter.branchId = allowed;
        }

        const batches = await StockBatch.find(filter)
            .populate("itemId", "name sku unit costPrice sellingPrice")
            .populate("branchId", "name")
            .sort({ createdAt: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Stock batches fetched successfully",
            data: batches,
        });
    } catch (err) {
        console.error("getStockBatches error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

