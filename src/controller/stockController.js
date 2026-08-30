import mongoose from "mongoose";
import joi from "joi";
import Stock from "../Schemas/stock.js";
import StockMovement from "../Schemas/stockMovement.js";
import Item from "../Schemas/item.js";
import Branch from "../Schemas/branch.js";

const objectId = () => joi.string().hex().length(24);

const addStockSchema = joi.object({
    itemId:   objectId().required(),
    branchId: objectId().required(),
    quantity: joi.number().integer().min(1).required(),
    note:     joi.string().max(500).optional().allow(""),
});

const movementQuerySchema = joi.object({
    itemId:   objectId().optional(),
    branchId: objectId().optional(),
    limit:    joi.number().integer().min(1).max(200).default(50),
    page:     joi.number().integer().min(1).default(1),
});

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// ── 1. addStock (purchase entry) ───────────────────────────────────────────
// POST /stock/add — admin, manager
export const addStock = async (req, res) => {
    try {
        const { error, value } = addStockSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { itemId, branchId, quantity, note } = value;
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

        // Find-or-create stock document
        let stock = await Stock.findOne({ organizationId, branchId, itemId });
        if (!stock) {
            stock = await Stock.create({ organizationId, branchId, itemId, quantity: 0 });
        }

        const previousQuantity = stock.quantity;
        const newQuantity      = previousQuantity + quantity;

        stock.quantity = newQuantity;
        await stock.save();

        // Write immutable movement record via native driver (bypasses Mongoose
        // update/delete immutability hooks — create is always allowed)
        const [movement] = await StockMovement.create([{
            organizationId,
            branchId,
            itemId,
            type:             "purchase",
            quantity,
            previousQuantity,
            newQuantity,
            refId:            null,
            note:             note || null,
            createdBy:        userId,
        }]);

        return res.status(201).json({
            success: true,
            message: "Stock added successfully",
            data: { stock, movement },
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

        let branchId;
        if (role === "admin") {
            branchId = req.query.branchId;
            if (!branchId) return fail(res, 400, "branchId query parameter is required for admin");
            const branch = await Branch.findOne({ _id: branchId, organizationId, isActive: true });
            if (!branch) return fail(res, 400, "Invalid branch");
        } else {
            branchId = req.allowedBranchId;
            if (!branchId) return fail(res, 400, "No branch assigned to your account");
        }

        const stockDocs = await Stock.find({ organizationId, branchId })
            .populate("itemId", "name sku unit reorderLevel isActive")
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
                .populate("itemId",    "name sku")
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
