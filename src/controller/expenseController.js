import joi from "joi";
import Expense from "../Schemas/expense.js";
import { createExpenseSchema, updateExpenseSchema } from "../validation/expense.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

const getQuerySchema = joi.object({
    branchId:  joi.string().hex().length(24).optional(),
    category:  joi.string().valid("rent","utilities","transport","maintenance","supplies","misc").optional(),
    startDate: joi.date().iso().optional(),
    endDate:   joi.date().iso().optional(),
    page:      joi.number().integer().min(1).default(1),
    limit:     joi.number().integer().min(1).max(200).default(20),
});

// ── 1. createExpense ───────────────────────────────────────────────────────
// POST /expenses — admin, manager
export const createExpense = async (req, res) => {
    try {
        const { error, value } = createExpenseSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role, id: userId } = req.user;

        // Manager is always locked to their own branch
        let branchId = value.branchId;
        if (role === "manager") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchId = req.allowedBranchId.toString();
        }

        const expense = await Expense.create({
            organizationId,
            branchId,
            category:    value.category,
            amount:      value.amount,
            description: value.description || null,
            date:        value.date,
            createdBy:   userId,
        });

        return res.status(201).json({
            success: true,
            message: "Expense recorded successfully",
            data:    expense,
        });
    } catch (err) {
        console.error("createExpense error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 2. getExpenses ─────────────────────────────────────────────────────────
// GET /expenses — admin, manager
export const getExpenses = async (req, res) => {
    try {
        const { organizationId, role } = req.user;

        const { error, value } = getQuerySchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { category, startDate, endDate, page, limit } = value;
        const skip = (page - 1) * limit;

        const filter = { organizationId };

        // Branch scoping
        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        } else if (value.branchId) {
            // Admin can optionally filter by a specific branch
            filter.branchId = value.branchId;
        }

        if (category) filter.category = category;

        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate)   filter.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }

        const [expenses, total] = await Promise.all([
            Expense.find(filter)
                .populate("createdBy", "firstName lastName")
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Expense.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            message: "Expenses fetched successfully",
            data:    expenses,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("getExpenses error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 3. updateExpense ───────────────────────────────────────────────────────
// PUT /expenses/:id — admin, manager
export const updateExpense = async (req, res) => {
    try {
        const { error, value } = updateExpenseSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role, id: userId } = req.user;
        const { id } = req.params;

        // Build ownership filter based on role
        let filter;
        if (role === "manager") {
            // Manager can only edit expenses they personally created in their own branch.
            // Using 404 (not 403) to avoid leaking that the expense exists in another branch.
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter = { _id: id, organizationId, branchId: locked, createdBy: userId };
        } else {
            // Admin can edit any expense in their org
            filter = { _id: id, organizationId };
        }

        const expense = await Expense.findOne(filter);
        if (!expense) return fail(res, 404, "Expense not found");

        const updated = await Expense.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Expense updated successfully",
            data:    updated,
        });
    } catch (err) {
        console.error("updateExpense error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 4. deleteExpense ───────────────────────────────────────────────────────
// DELETE /expenses/:id — admin only
// Hard delete is safe here — expenses are not referenced by other collections.
export const deleteExpense = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { id } = req.params;

        // Org ownership check prevents deleting another tenant's expenses
        const expense = await Expense.findOne({ _id: id, organizationId });
        if (!expense) return fail(res, 404, "Expense not found");

        await Expense.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Expense deleted successfully",
            data:    null,
        });
    } catch (err) {
        console.error("deleteExpense error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
