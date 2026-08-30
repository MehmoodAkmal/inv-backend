import mongoose from "mongoose";
import joi from "joi";
import Sale from "../Schemas/sale.js";
import Expense from "../Schemas/expense.js";
import SalaryPayment from "../Schemas/salaryPayment.js";
import Stock from "../Schemas/stock.js";
import Customer from "../Schemas/customer.js";
import Branch from "../Schemas/branch.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

const r2 = (n) => Math.round((n ?? 0) * 100) / 100;

// Parse ISO date string to start of day (00:00:00.000 UTC)
const dayStart = (iso) => new Date(`${iso}T00:00:00.000Z`);

// Parse ISO date string to end of day (23:59:59.999 UTC)
const dayEnd   = (iso) => new Date(`${iso}T23:59:59.999Z`);

// ── Date range validator (reused across endpoints) ─────────────────────────
const dateRangeSchema = joi.object({
    startDate: joi.date().iso().required(),
    endDate:   joi.date().iso().min(joi.ref("startDate")).required()
               .messages({ "date.min": "endDate must not be before startDate" }),
}).unknown(true); // allow other query params to pass through

// ── Sale P&L aggregation helper ────────────────────────────────────────────
// Returns { totalRevenue, totalCOGS, totalCashSales, totalCreditSales, saleCount }
async function salePnL(matchStage) {
    const result = await Sale.aggregate([
        { $match: matchStage },
        { $facet: {
            // Top-level revenue and payment-type breakdown (no unwind needed)
            summary: [
                { $group: {
                    _id: null,
                    totalRevenue:     { $sum: "$totalAmount" },
                    totalCashSales:   { $sum: { $cond: [{ $eq: ["$paymentType", "cash"] }, "$totalAmount", 0] } },
                    totalCreditSales: { $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, "$totalAmount", 0] } },
                    saleCount:        { $sum: 1 },
                }},
            ],
            // COGS requires unwinding the items subdocument array
            cogs: [
                { $unwind: "$items" },
                { $group: {
                    _id: null,
                    totalCOGS: { $sum: { $multiply: ["$items.quantity", "$items.costPriceAtSale"] } },
                }},
            ],
        }},
    ]);

    const summary = result[0]?.summary[0] ?? {};
    const cogs    = result[0]?.cogs[0] ?? {};

    return {
        totalRevenue:     r2(summary.totalRevenue     ?? 0),
        totalCashSales:   r2(summary.totalCashSales   ?? 0),
        totalCreditSales: r2(summary.totalCreditSales ?? 0),
        saleCount:        summary.saleCount ?? 0,
        totalCOGS:        r2(cogs.totalCOGS ?? 0),
    };
}

// ── Expense aggregation helper ─────────────────────────────────────────────
async function totalExpensesAgg(matchStage) {
    const result = await Expense.aggregate([
        { $match: matchStage },
        { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    return r2(result[0]?.total ?? 0);
}

// ── Salary aggregation helper ──────────────────────────────────────────────
// SalaryPayment uses `paidOn` (Date) field for date filtering.
async function totalSalariesAgg(matchStage) {
    const result = await SalaryPayment.aggregate([
        { $match: matchStage },
        { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    return r2(result[0]?.total ?? 0);
}

// ── Outstanding credit helper ──────────────────────────────────────────────
async function outstandingCredit(filter) {
    const result = await Customer.aggregate([
        { $match: { ...filter, currentBalance: { $gt: 0 }, isActive: true } },
        { $group: { _id: null, total: { $sum: "$currentBalance" } } },
    ]);
    return r2(result[0]?.total ?? 0);
}

// ── 1. getProfitLoss ───────────────────────────────────────────────────────
// GET /reports/profit-loss — admin, manager
export const getProfitLoss = async (req, res) => {
    try {
        const { error, value } = dateRangeSchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role } = req.user;
        const orgId = new mongoose.Types.ObjectId(organizationId);

        // Branch scoping
        let branchId = null;
        if (role === "manager") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchId = new mongoose.Types.ObjectId(req.allowedBranchId);
        } else if (req.query.branchId) {
            branchId = new mongoose.Types.ObjectId(req.query.branchId);
        }

        const start = dayStart(value.startDate.toISOString().slice(0, 10));
        const end   = dayEnd(value.endDate.toISOString().slice(0, 10));

        // Build match stages — branchId optional
        const baseMatch = branchId
            ? { organizationId: orgId, branchId }
            : { organizationId: orgId };

        const saleMatcher    = { ...baseMatch, createdAt: { $gte: start, $lte: end } };
        const expenseMatcher = { ...baseMatch, date:      { $gte: start, $lte: end } };
        const salaryMatcher  = { ...baseMatch, paidOn:    { $gte: start, $lte: end } };
        const creditFilter   = branchId
            ? { organizationId: orgId, branchId }
            : { organizationId: orgId };

        // Run all aggregations in parallel
        const [pnl, totalExpenses, totalSalaries, totalOutstandingCredit] = await Promise.all([
            salePnL(saleMatcher),
            totalExpensesAgg(expenseMatcher),
            totalSalariesAgg(salaryMatcher),
            outstandingCredit(creditFilter),
        ]);

        const grossProfit = r2(pnl.totalRevenue - pnl.totalCOGS);
        const netProfit   = r2(grossProfit - totalExpenses - totalSalaries);

        return res.status(200).json({
            success: true,
            message: "Profit & loss report generated",
            data: {
                branchId:             branchId ?? null,
                startDate:            value.startDate,
                endDate:              value.endDate,
                // Revenue
                totalRevenue:         pnl.totalRevenue,
                totalCashSales:       pnl.totalCashSales,
                totalCreditSales:     pnl.totalCreditSales,
                saleCount:            pnl.saleCount,
                // Cost
                totalCOGS:            pnl.totalCOGS,
                grossProfit,
                // Operating costs
                totalExpenses,
                totalSalaries,
                // Net
                netProfit,
                // Snapshot — not period-filtered
                totalOutstandingCredit,
            },
        });
    } catch (err) {
        console.error("getProfitLoss error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 2. getBranchComparison ─────────────────────────────────────────────────
// GET /reports/branch-comparison — admin only
export const getBranchComparison = async (req, res) => {
    try {
        const { error, value } = dateRangeSchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { organizationId } = req.user;
        const orgId = new mongoose.Types.ObjectId(organizationId);

        const start = dayStart(value.startDate.toISOString().slice(0, 10));
        const end   = dayEnd(value.endDate.toISOString().slice(0, 10));

        // ── Sales per branch ──────────────────────────────────────────────
        const salesByBranch = await Sale.aggregate([
            { $match: { organizationId: orgId, createdAt: { $gte: start, $lte: end } } },
            { $facet: {
                summary: [
                    { $group: {
                        _id:              "$branchId",
                        totalRevenue:     { $sum: "$totalAmount" },
                        totalCashSales:   { $sum: { $cond: [{ $eq: ["$paymentType", "cash"] }, "$totalAmount", 0] } },
                        totalCreditSales: { $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, "$totalAmount", 0] } },
                        saleCount:        { $sum: 1 },
                    }},
                ],
                cogs: [
                    { $unwind: "$items" },
                    { $group: {
                        _id:       "$branchId",
                        totalCOGS: { $sum: { $multiply: ["$items.quantity", "$items.costPriceAtSale"] } },
                    }},
                ],
            }},
        ]);

        // ── Expenses per branch ───────────────────────────────────────────
        const expensesByBranch = await Expense.aggregate([
            { $match: { organizationId: orgId, date: { $gte: start, $lte: end } } },
            { $group: { _id: "$branchId", totalExpenses: { $sum: "$amount" } } },
        ]);

        // ── Salaries per branch ───────────────────────────────────────────
        const salariesByBranch = await SalaryPayment.aggregate([
            { $match: { organizationId: orgId, paidOn: { $gte: start, $lte: end } } },
            { $group: { _id: "$branchId", totalSalaries: { $sum: "$amount" } } },
        ]);

        // ── All branches for this org ─────────────────────────────────────
        const branches = await Branch.find({ organizationId: orgId }).lean();

        // ── Merge into one object per branch ──────────────────────────────
        const summaryMap  = Object.fromEntries((salesByBranch[0]?.summary  ?? []).map((r) => [r._id.toString(), r]));
        const cogsMap     = Object.fromEntries((salesByBranch[0]?.cogs     ?? []).map((r) => [r._id.toString(), r]));
        const expenseMap  = Object.fromEntries(expensesByBranch.map((r) => [r._id.toString(), r]));
        const salaryMap   = Object.fromEntries(salariesByBranch.map((r) => [r._id.toString(), r]));

        const rows = branches.map((branch) => {
            const key           = branch._id.toString();
            const s             = summaryMap[key]  ?? {};
            const c             = cogsMap[key]     ?? {};
            const e             = expenseMap[key]  ?? {};
            const sal           = salaryMap[key]   ?? {};
            const totalRevenue  = r2(s.totalRevenue  ?? 0);
            const totalCOGS     = r2(c.totalCOGS     ?? 0);
            const grossProfit   = r2(totalRevenue - totalCOGS);
            const totalExpenses = r2(e.totalExpenses ?? 0);
            const totalSalaries = r2(sal.totalSalaries ?? 0);
            const netProfit     = r2(grossProfit - totalExpenses - totalSalaries);

            return {
                branchId:         branch._id,
                branchName:       branch.name,
                totalRevenue,
                totalCashSales:   r2(s.totalCashSales   ?? 0),
                totalCreditSales: r2(s.totalCreditSales ?? 0),
                saleCount:        s.saleCount ?? 0,
                totalCOGS,
                grossProfit,
                totalExpenses,
                totalSalaries,
                netProfit,
            };
        });

        // Sort by netProfit descending
        rows.sort((a, b) => b.netProfit - a.netProfit);

        return res.status(200).json({
            success: true,
            message: "Branch comparison report generated",
            data: {
                startDate: value.startDate,
                endDate:   value.endDate,
                branches:  rows,
            },
        });
    } catch (err) {
        console.error("getBranchComparison error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 3. getLowStockAlert ────────────────────────────────────────────────────
// GET /reports/low-stock — admin, manager
export const getLowStockAlert = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const orgId = new mongoose.Types.ObjectId(organizationId);

        let branchFilter = {};
        if (role === "manager") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchFilter = { branchId: new mongoose.Types.ObjectId(req.allowedBranchId) };
        } else if (req.query.branchId) {
            branchFilter = { branchId: new mongoose.Types.ObjectId(req.query.branchId) };
        }

        // Single aggregation: $lookup Item and $lookup Branch, filter in pipeline
        // — avoids N+1 queries entirely
        const alerts = await Stock.aggregate([
            { $match: { organizationId: orgId, ...branchFilter } },

            // Join Item to get reorderLevel
            { $lookup: {
                from:         "items",
                localField:   "itemId",
                foreignField: "_id",
                as:           "item",
            }},
            { $unwind: "$item" },

            // Only keep stock where quantity <= reorderLevel and item is active
            { $match: {
                "item.isActive": true,
                $expr: { $lte: ["$quantity", "$item.reorderLevel"] },
            }},

            // Join Branch for name
            { $lookup: {
                from:         "branches",
                localField:   "branchId",
                foreignField: "_id",
                as:           "branch",
            }},
            { $unwind: { path: "$branch", preserveNullAndEmpty: true } },

            // Project only what the frontend needs
            { $project: {
                _id:             0,
                itemId:          "$item._id",
                itemName:        "$item.name",
                sku:             "$item.sku",
                unit:            "$item.unit",
                branchId:        1,
                branchName:      "$branch.name",
                currentQuantity: "$quantity",
                reorderLevel:    "$item.reorderLevel",
            }},

            { $sort: { currentQuantity: 1 } }, // most critical (lowest qty) first
        ]);

        return res.status(200).json({
            success: true,
            message: "Low stock alerts fetched",
            data:    alerts,
        });
    } catch (err) {
        console.error("getLowStockAlert error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 4. getDashboardSummary ─────────────────────────────────────────────────
// GET /reports/dashboard-summary — admin, manager, cashier
export const getDashboardSummary = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const orgId = new mongoose.Types.ObjectId(organizationId);

        // Branch scoping
        let branchId = null;
        if (role === "manager" || role === "cashier") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchId = new mongoose.Types.ObjectId(req.allowedBranchId);
        } else if (req.query.branchId) {
            branchId = new mongoose.Types.ObjectId(req.query.branchId);
        }

        const baseMatch = branchId
            ? { organizationId: orgId, branchId }
            : { organizationId: orgId };

        // Today's boundaries (UTC)
        const now       = new Date();
        const todayStr  = now.toISOString().slice(0, 10);
        const todayStart = dayStart(todayStr);
        const todayEnd   = dayEnd(todayStr);

        // This month's boundaries
        const monthStr  = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const monthStart = dayStart(`${monthStr}-01`);
        const monthEnd   = todayEnd; // up to end of today

        // Run all summary queries in parallel — no P&L unwind needed, just counts/sums
        const [todaySalesAgg, monthSalesAgg, lowStockCount, outstandingTotal] = await Promise.all([
            // Today's sales
            Sale.aggregate([
                { $match: { ...baseMatch, createdAt: { $gte: todayStart, $lte: todayEnd } } },
                { $group: {
                    _id:          null,
                    count:        { $sum: 1 },
                    totalAmount:  { $sum: "$totalAmount" },
                    cashAmount:   { $sum: { $cond: [{ $eq: ["$paymentType", "cash"] }, "$totalAmount", 0] } },
                    creditAmount: { $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, "$totalAmount", 0] } },
                }},
            ]),

            // This month's sales
            Sale.aggregate([
                { $match: { ...baseMatch, createdAt: { $gte: monthStart, $lte: monthEnd } } },
                { $group: {
                    _id:         null,
                    count:       { $sum: 1 },
                    totalAmount: { $sum: "$totalAmount" },
                }},
            ]),

            // Low stock count — stock docs where quantity <= reorderLevel (via lookup)
            Stock.aggregate([
                { $match: { organizationId: orgId, ...(branchId ? { branchId } : {}) } },
                { $lookup: { from: "items", localField: "itemId", foreignField: "_id", as: "item" } },
                { $unwind: "$item" },
                { $match: { "item.isActive": true, $expr: { $lte: ["$quantity", "$item.reorderLevel"] } } },
                { $count: "total" },
            ]),

            // Outstanding credit total
            Customer.aggregate([
                { $match: { ...baseMatch, currentBalance: { $gt: 0 }, isActive: true } },
                { $group: { _id: null, total: { $sum: "$currentBalance" } } },
            ]),
        ]);

        const today  = todaySalesAgg[0]  ?? {};
        const month  = monthSalesAgg[0]  ?? {};

        return res.status(200).json({
            success: true,
            message: "Dashboard summary fetched",
            data: {
                branchId: branchId ?? null,
                today: {
                    saleCount:        today.count        ?? 0,
                    totalAmount:      r2(today.totalAmount  ?? 0),
                    cashSales:        r2(today.cashAmount   ?? 0),
                    creditSales:      r2(today.creditAmount ?? 0),
                },
                thisMonth: {
                    saleCount:   month.count       ?? 0,
                    totalAmount: r2(month.totalAmount ?? 0),
                },
                lowStockItemCount:      lowStockCount[0]?.total  ?? 0,
                outstandingCreditTotal: r2(outstandingTotal[0]?.total ?? 0),
            },
        });
    } catch (err) {
        console.error("getDashboardSummary error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
