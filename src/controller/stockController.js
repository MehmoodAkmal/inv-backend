import mongoose from "mongoose";
import joi from "joi";
import Stock from "../Schemas/stock.js";
import StockMovement from "../Schemas/stockMovement.js";
import Item from "../Schemas/item.js";
import Branch from "../Schemas/branch.js";

// ── Joi schemas ────────────────────────────────────────────────────────────

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

// ── Helper ─────────────────────────────────────────────────────────────────

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// ── 1. addStock (purchase entry) ───────────────────────────────────────────
// POST /stock/add — admin, manager
export const addStock = async (req, res) => {
    // Validate body
    const { error, value } = addStockSchema.validate(req.body);
    if (error) return fail(res, 400, error.message);

    const { itemId, branchId, quantity, note } = value;
    const { organizationId, role, id: userId } = req.user;

    // Managers are locked to their own branch — reject any mismatch
    if (role === "manager") {
        const allowed = req.allowedBranchId?.toString();
        if (!allowed || allowed !== branchId) {
            return fail(res, 403, "You can only add stock to your assigned branch");
        }
    }

    // Verify item belongs to this org and is active
    const item = await Item.findOne({ _id: itemId, organizationId, isActive: true });
    if (!item) return fail(res, 400, "Invalid item");

    // Verify branch belongs to this org and is active
    const branch = await Branch.findOne({ _id: branchId, organizationId, isActive: true });
    if (!branch) return fail(res, 400, "Invalid branch");

    // ── Transaction ────────────────────────────────────────────────────────
    // NOTE: MongoDB transactions require a replica set (or mongos).
    // For a single-node local dev setup, either convert to a replica set
    // (mongod --replSet rs0) or remove the session/transaction calls and
    // accept the small window of inconsistency during development.
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // Find-or-create the stock document (upsert, initial quantity = 0)
        let stock = await Stock.findOne(
            { organizationId, branchId, itemId },
            null,
            { session }
        );

        if (!stock) {
            // Create via Model constructor + save so the session is respected
            const newStock = new Stock({ organizationId, branchId, itemId, quantity: 0 });
            stock = await newStock.save({ session });
        }

        const previousQuantity = stock.quantity;
        const newQuantity      = previousQuantity + quantity;

        // Update stock quantity in place
        stock.quantity = newQuantity;
        await stock.save({ session });

        // Write the immutable movement record
        const [movement] = await StockMovement.create(
            [{
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
            }],
            { session }
        );

        await session.commitTransaction();

        return res.status(201).json({
            success: true,
            message: "Stock added successfully",
            data: { stock, movement },
        });
    } catch (err) {
        await session.abortTransaction();
        console.error("addStock error:", err);
        return fail(res, 500, "An unexpected error occurred");
    } finally {
        session.endSession();
    }
};

// ── 2. getStockByBranch ────────────────────────────────────────────────────
// GET /stock — admin, manager, cashier
export const getStockByBranch = async (req, res) => {
    try {
        const { organizationId, role } = req.user;

        // Non-admin roles are always locked to their own branch
        let branchId;
        if (role === "admin") {
            branchId = req.query.branchId;
            if (!branchId) {
                return fail(res, 400, "branchId query parameter is required for admin");
            }
            // Verify the branch belongs to this admin's org
            const branch = await Branch.findOne({ _id: branchId, organizationId, isActive: true });
            if (!branch) return fail(res, 400, "Invalid branch");
        } else {
            // manager / cashier — ignore any client-supplied branchId
            branchId = req.allowedBranchId;
            if (!branchId) {
                return fail(res, 400, "No branch assigned to your account");
            }
        }

        const stockDocs = await Stock.find({ organizationId, branchId })
            .populate("itemId", "name sku unit reorderLevel isActive")
            .sort({ updatedAt: -1 })
            .lean();

        // Attach computed isLowStock flag and filter out docs where item
        // was soft-deleted (populate returns null for deleted items)
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

        // Validate + coerce query params
        const { error, value } = movementQuerySchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { limit, page } = value;
        const skip = (page - 1) * limit;

        const filter = { organizationId };

        // Branch scoping — managers are locked to their own branch
        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        } else if (value.branchId) {
            // Admin can optionally filter by any branch in their org
            filter.branchId = value.branchId;
        }

        // Optional item filter
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
            success:  true,
            message:  "Stock movement history fetched successfully",
            data:     movements,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("getStockMovementHistory error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
