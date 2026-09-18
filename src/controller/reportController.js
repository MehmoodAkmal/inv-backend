import mongoose from "mongoose";
import joi from "joi";
import Sale from "../Schemas/sale.js";
import Expense from "../Schemas/expense.js";
import SalaryPayment from "../Schemas/salaryPayment.js";
import Stock from "../Schemas/stock.js";
import Customer from "../Schemas/customer.js";
import Branch from "../Schemas/branch.js";
import Item from "../Schemas/item.js";
import LedgerEntry from "../Schemas/ledgerEntry.js";

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
            { $unwind: { path: "$branch", preserveNullAndEmptyArrays: true } },

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

        // Yesterday's boundaries
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yStr          = yesterdayDate.toISOString().slice(0, 10);
        const yesterdayStart = dayStart(yStr);
        const yesterdayEnd   = dayEnd(yStr);

        // 7-day daily trend (today + 6 prior days)
        const [yesterdaySalesAgg, sevenDayAgg] = await Promise.all([
            Sale.aggregate([
                { $match: { ...baseMatch, createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
                { $group: {
                    _id:          null,
                    count:        { $sum: 1 },
                    totalAmount:  { $sum: "$totalAmount" },
                    cashAmount:   { $sum: { $cond: [{ $eq: ["$paymentType", "cash"] }, "$totalAmount", 0] } },
                    creditAmount: { $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, "$totalAmount", 0] } },
                }},
            ]),
            Sale.aggregate([
                { $match: { ...baseMatch, createdAt: { $gte: dayStart(new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().slice(0,10)), $lte: todayEnd } } },
                { $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" }
                    },
                    total:  { $sum: "$totalAmount" },
                    cash:   { $sum: { $cond: [{ $eq: ["$paymentType", "cash"] }, "$totalAmount", 0] } },
                    credit: { $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, "$totalAmount", 0] } },
                    count:  { $sum: 1 },
                }},
                { $sort: { "_id": 1 } },
            ]),
        ]);

        // Fill all 7 days (including days with zero sales)
        const trendMap = Object.fromEntries(sevenDayAgg.map((d) => [d._id, d]));
        const trend = Array.from({ length: 7 }, (_, i) => {
            const d   = new Date(now);
            d.setDate(d.getDate() - (6 - i));
            const key = d.toISOString().slice(0, 10);
            const day = trendMap[key] ?? {};
            return {
                date:   key,
                label:  d.toLocaleDateString("en-US", { weekday: "short" }),
                total:  r2(day.total  ?? 0),
                cash:   r2(day.cash   ?? 0),
                credit: r2(day.credit ?? 0),
                count:  day.count ?? 0,
            };
        });

        const today     = todaySalesAgg[0]  ?? {};
        const yesterdayData = yesterdaySalesAgg[0] ?? {};
        const month     = monthSalesAgg[0]  ?? {};

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
                yesterday: {
                    saleCount:        yesterdayData.count        ?? 0,
                    totalAmount:      r2(yesterdayData.totalAmount  ?? 0),
                    cashSales:        r2(yesterdayData.cashAmount   ?? 0),
                    creditSales:      r2(yesterdayData.creditAmount ?? 0),
                },
                thisMonth: {
                    saleCount:   month.count       ?? 0,
                    totalAmount: r2(month.totalAmount ?? 0),
                },
                trend7Days:            trend,
                lowStockItemCount:      lowStockCount[0]?.total  ?? 0,
                outstandingCreditTotal: r2(outstandingTotal[0]?.total ?? 0),
            },
        });
    } catch (err) {
        console.error("getDashboardSummary error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 5. getComprehensiveReport ─────────────────────────────────────────────
// GET /reports/comprehensive — admin only
export const getComprehensiveReport = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return fail(res, 403, "Access denied. Only administrators can generate executive reports.");
        }

        const { organizationId } = req.user;
        const orgId = new mongoose.Types.ObjectId(organizationId);

        const {
            interval = "monthly", // "daily" | "monthly" | "6months" | "annually" | "custom"
            date,
            month,
            year,
            half,
            startDate,
            endDate,
            branchId,
        } = req.query;

        // 1. Resolve date range
        let start, end, periodLabel;
        const now = new Date();

        if (interval === "daily") {
            const dStr = date ? String(date).slice(0, 10) : now.toISOString().slice(0, 10);
            start = dayStart(dStr);
            end   = dayEnd(dStr);
            periodLabel = `Daily (${dStr})`;
        } else if (interval === "monthly") {
            const y = year ? parseInt(year, 10) : now.getUTCFullYear();
            const m = month ? parseInt(month, 10) : (now.getUTCMonth() + 1);
            const padM = String(m).padStart(2, "0");
            const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
            start = new Date(`${y}-${padM}-01T00:00:00.000Z`);
            end   = new Date(`${y}-${padM}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`);
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            periodLabel = `Monthly (${monthNames[m - 1]} ${y})`;
        } else if (interval === "6months") {
            const y = year ? parseInt(year, 10) : now.getUTCFullYear();
            const h = half ? String(half).toUpperCase() : (now.getUTCMonth() < 6 ? "H1" : "H2");
            if (h === "H1") {
                start = new Date(`${y}-01-01T00:00:00.000Z`);
                end   = new Date(`${y}-06-30T23:59:59.999Z`);
                periodLabel = `6 Months (H1 Jan–Jun ${y})`;
            } else if (h === "H2") {
                start = new Date(`${y}-07-01T00:00:00.000Z`);
                end   = new Date(`${y}-12-31T23:59:59.999Z`);
                periodLabel = `6 Months (H2 Jul–Dec ${y})`;
            } else {
                const sixMonthsAgo = new Date(now);
                sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
                start = new Date(`${sixMonthsAgo.toISOString().slice(0, 10)}T00:00:00.000Z`);
                end   = new Date(`${now.toISOString().slice(0, 10)}T23:59:59.999Z`);
                periodLabel = `Last 6 Months (Rolling)`;
            }
        } else if (interval === "annually") {
            const y = year ? parseInt(year, 10) : now.getUTCFullYear();
            start = new Date(`${y}-01-01T00:00:00.000Z`);
            end   = new Date(`${y}-12-31T23:59:59.999Z`);
            periodLabel = `Annual (${y})`;
        } else if (interval === "custom") {
            if (!startDate || !endDate) {
                return fail(res, 400, "startDate and endDate are required for custom interval");
            }
            const sStr = String(startDate).slice(0, 10);
            const eStr = String(endDate).slice(0, 10);
            start = dayStart(sStr);
            end   = dayEnd(eStr);
            if (end < start) {
                return fail(res, 400, "endDate cannot be before startDate");
            }
            periodLabel = `Custom (${sStr} to ${eStr})`;
        } else {
            return fail(res, 400, "Invalid interval. Allowed: daily, monthly, 6months, annually, custom");
        }

        // 2. Resolve branch scoping
        let targetBranchId = null;
        let branchInfo = null;
        if (branchId && branchId !== "all" && branchId !== "null" && branchId !== "undefined") {
            if (!mongoose.Types.ObjectId.isValid(branchId)) {
                return fail(res, 400, "Invalid branch ID");
            }
            targetBranchId = new mongoose.Types.ObjectId(branchId);
            branchInfo = await Branch.findOne({ _id: targetBranchId, organizationId: orgId, isActive: true }).lean();
            if (!branchInfo) {
                return fail(res, 400, "Branch not found or inactive");
            }
        }

        // Base match objects
        const baseMatch = targetBranchId
            ? { organizationId: orgId, branchId: targetBranchId }
            : { organizationId: orgId };

        const saleMatch     = { ...baseMatch, createdAt: { $gte: start, $lte: end } };
        const expenseMatch  = { ...baseMatch, date:      { $gte: start, $lte: end } };
        const salaryMatch   = { ...baseMatch, paidOn:    { $gte: start, $lte: end } };
        const ledgerMatch   = { ...baseMatch, createdAt: { $gte: start, $lte: end } };
        const stockMatch    = { ...baseMatch };
        const customerMatch = { ...baseMatch, isActive: true };

        // Determine timeline grouping format
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const groupFormat = diffDays <= 45 ? "%Y-%m-%d" : "%Y-%m";

        // 3. Parallel database queries
        const [
            salesAgg,
            categorySalesAgg,
            expensesAgg,
            salariesAgg,
            stockValuationAgg,
            receivablesAgg,
            ledgerAgg,
            salesTimelineAgg,
            expenseTimelineAgg,
            branchList,
            branchSalesAgg,
            branchExpensesAgg,
            branchSalariesAgg,
        ] = await Promise.all([
            // Sales Summary, COGS & Top 5 items
            Sale.aggregate([
                { $match: saleMatch },
                { $facet: {
                    summary: [
                        { $group: {
                            _id: null,
                            totalRevenue:     { $sum: "$totalAmount" },
                            totalCashSales:   { $sum: { $cond: [{ $eq: ["$paymentType", "cash"] }, "$totalAmount", 0] } },
                            totalCreditSales: { $sum: { $cond: [{ $eq: ["$paymentType", "credit"] }, "$totalAmount", 0] } },
                            totalDiscount:    { $sum: "$discount" },
                            saleCount:        { $sum: 1 },
                        }},
                    ],
                    cogs: [
                        { $unwind: "$items" },
                        { $group: {
                            _id: null,
                            totalCOGS:      { $sum: { $multiply: ["$items.quantity", "$items.costPriceAtSale"] } },
                            totalUnitsSold: { $sum: "$items.quantity" },
                        }},
                    ],
                    topItems: [
                        { $unwind: "$items" },
                        { $group: {
                            _id: "$items.itemId",
                            quantitySold:     { $sum: "$items.quantity" },
                            revenueGenerated: { $sum: "$items.lineTotal" },
                        }},
                        { $sort: { revenueGenerated: -1 } },
                        { $limit: 5 },
                        { $lookup: {
                            from: "items",
                            localField: "_id",
                            foreignField: "_id",
                            as: "itemDoc",
                        }},
                        { $unwind: { path: "$itemDoc", preserveNullAndEmptyArrays: true } },
                        { $project: {
                            itemId: "$_id",
                            name: { $ifNull: ["$itemDoc.name", "Unknown Item"] },
                            sku:  { $ifNull: ["$itemDoc.sku", "—"] },
                            unit: { $ifNull: ["$itemDoc.unit", "pcs"] },
                            quantitySold: 1,
                            revenueGenerated: 1,
                        }},
                    ],
                }},
            ]),

            // Category breakdown
            Sale.aggregate([
                { $match: saleMatch },
                { $unwind: "$items" },
                { $lookup: {
                    from: "items",
                    localField: "items.itemId",
                    foreignField: "_id",
                    as: "itemDoc",
                }},
                { $unwind: { path: "$itemDoc", preserveNullAndEmptyArrays: true } },
                { $lookup: {
                    from: "categories",
                    localField: "itemDoc.categoryId",
                    foreignField: "_id",
                    as: "catDoc",
                }},
                { $unwind: { path: "$catDoc", preserveNullAndEmptyArrays: true } },
                { $group: {
                    _id: { $ifNull: ["$catDoc.name", "Uncategorized"] },
                    revenue: { $sum: "$items.lineTotal" },
                    units:   { $sum: "$items.quantity" },
                }},
                { $sort: { revenue: -1 } },
            ]),

            // Expenses breakdown by category
            Expense.aggregate([
                { $match: expenseMatch },
                { $group: {
                    _id: "$category",
                    total: { $sum: "$amount" },
                    count: { $sum: 1 },
                }},
                { $sort: { total: -1 } },
            ]),

            // Salaries total
            SalaryPayment.aggregate([
                { $match: salaryMatch },
                { $group: {
                    _id: null,
                    total: { $sum: "$amount" },
                    count: { $sum: 1 },
                }},
            ]),

            // Stock valuation & count
            Stock.aggregate([
                { $match: stockMatch },
                { $lookup: {
                    from: "items",
                    localField: "itemId",
                    foreignField: "_id",
                    as: "itemDoc",
                }},
                { $unwind: { path: "$itemDoc", preserveNullAndEmptyArrays: true } },
                { $group: {
                    _id: null,
                    stockValueAtCost:   { $sum: { $multiply: ["$quantity", { $ifNull: ["$itemDoc.costPrice", 0] }] } },
                    stockValueAtRetail: { $sum: { $multiply: ["$quantity", { $ifNull: ["$itemDoc.sellingPrice", 0] }] } },
                    totalQuantity:      { $sum: "$quantity" },
                    skuCount:           { $sum: 1 },
                    lowStockCount: {
                        $sum: {
                            $cond: [
                                { $lte: ["$quantity", { $ifNull: ["$itemDoc.reorderLevel", 5] }] },
                                1,
                                0
                            ]
                        }
                    },
                }},
            ]),

            // Total outstanding customer debt
            Customer.aggregate([
                { $match: { ...customerMatch, currentBalance: { $gt: 0 } } },
                { $group: {
                    _id: null,
                    totalDebt:   { $sum: "$currentBalance" },
                    debtorCount: { $sum: 1 },
                }},
            ]),

            // Ledger movements during period
            LedgerEntry.aggregate([
                { $match: ledgerMatch },
                { $group: {
                    _id: "$type",
                    totalAmount: { $sum: "$amount" },
                    entryCount:  { $sum: 1 },
                }},
            ]),

            // Sales timeline for charting
            Sale.aggregate([
                { $match: saleMatch },
                { $group: {
                    _id: { $dateToString: { format: groupFormat, date: "$createdAt", timezone: "UTC" } },
                    revenue: { $sum: "$totalAmount" },
                    count:   { $sum: 1 },
                }},
                { $sort: { _id: 1 } },
            ]),

            // Expense timeline for charting
            Expense.aggregate([
                { $match: expenseMatch },
                { $group: {
                    _id: { $dateToString: { format: groupFormat, date: "$date", timezone: "UTC" } },
                    expenses: { $sum: "$amount" },
                }},
                { $sort: { _id: 1 } },
            ]),

            // All branches (for multi-branch comparison in overall mode)
            Branch.find({ organizationId: orgId, isActive: true }).select("name code address").lean(),

            // Branch sales (if overall mode)
            !targetBranchId
                ? Sale.aggregate([
                    { $match: { organizationId: orgId, createdAt: { $gte: start, $lte: end } } },
                    { $facet: {
                        summary: [
                            { $group: {
                                _id: "$branchId",
                                revenue:   { $sum: "$totalAmount" },
                                saleCount: { $sum: 1 },
                            }},
                        ],
                        cogs: [
                            { $unwind: "$items" },
                            { $group: {
                                _id: "$branchId",
                                totalCOGS: { $sum: { $multiply: ["$items.quantity", "$items.costPriceAtSale"] } },
                            }},
                        ],
                    }},
                ])
                : Promise.resolve([]),

            // Branch expenses (if overall mode)
            !targetBranchId
                ? Expense.aggregate([
                    { $match: { organizationId: orgId, date: { $gte: start, $lte: end } } },
                    { $group: { _id: "$branchId", expenses: { $sum: "$amount" } } },
                ])
                : Promise.resolve([]),

            // Branch salaries (if overall mode)
            !targetBranchId
                ? SalaryPayment.aggregate([
                    { $match: { organizationId: orgId, paidOn: { $gte: start, $lte: end } } },
                    { $group: { _id: "$branchId", salaries: { $sum: "$amount" } } },
                ])
                : Promise.resolve([]),
        ]);

        // 4. Synthesize financial metrics
        const saleSummary = salesAgg[0]?.summary[0] ?? {};
        const saleCOGS    = salesAgg[0]?.cogs[0] ?? {};
        const topItems    = (salesAgg[0]?.topItems ?? []).map((t) => ({
            ...t,
            revenueGenerated: r2(t.revenueGenerated),
        }));

        const totalRevenue       = r2(saleSummary.totalRevenue ?? 0);
        const totalCashSales     = r2(saleSummary.totalCashSales ?? 0);
        const totalCreditSales   = r2(saleSummary.totalCreditSales ?? 0);
        const totalDiscount      = r2(saleSummary.totalDiscount ?? 0);
        const saleCount          = saleSummary.saleCount ?? 0;
        const totalUnitsSold     = saleCOGS.totalUnitsSold ?? 0;
        const totalCOGS          = r2(saleCOGS.totalCOGS ?? 0);
        const averageTicketSize  = saleCount > 0 ? r2(totalRevenue / saleCount) : 0;

        const grossProfit        = r2(totalRevenue - totalCOGS);
        const grossMarginPct     = totalRevenue > 0 ? r2((grossProfit / totalRevenue) * 100) : 0;

        const totalExpenses      = r2(expensesAgg.reduce((sum, e) => sum + (e.total || 0), 0));
        const totalSalaries      = r2(salariesAgg[0]?.total ?? 0);
        const totalOperatingCost = r2(totalExpenses + totalSalaries);

        const netProfit          = r2(grossProfit - totalOperatingCost);
        const netMarginPct       = totalRevenue > 0 ? r2((netProfit / totalRevenue) * 100) : 0;

        // Inventory snapshot
        const stockData = stockValuationAgg[0] ?? {};
        const inventory = {
            stockValueAtCost:   r2(stockData.stockValueAtCost ?? 0),
            stockValueAtRetail: r2(stockData.stockValueAtRetail ?? 0),
            potentialProfit:    r2((stockData.stockValueAtRetail ?? 0) - (stockData.stockValueAtCost ?? 0)),
            totalUnits:         stockData.totalQuantity ?? 0,
            skuCount:           stockData.skuCount ?? 0,
            lowStockCount:      stockData.lowStockCount ?? 0,
        };

        // Receivables snapshot
        const ledgerMap = Object.fromEntries(ledgerAgg.map((l) => [l._id, l]));
        const receivables = {
            totalOutstandingDebt:  r2(receivablesAgg[0]?.totalDebt ?? 0),
            debtorCount:           receivablesAgg[0]?.debtorCount ?? 0,
            creditIssuedInPeriod:  r2(ledgerMap["sale"]?.totalAmount ?? 0),
            debtCollectedInPeriod: r2(ledgerMap["payment"]?.totalAmount ?? 0),
        };

        // Category breakdown
        const categoryBreakdown = categorySalesAgg.map((c) => ({
            name: c._id,
            revenue: r2(c.revenue),
            units: c.units,
            percentage: totalRevenue > 0 ? r2((c.revenue / totalRevenue) * 100) : 0,
        }));

        // Expense category breakdown
        const expenseBreakdown = expensesAgg.map((e) => ({
            category: e._id || "General",
            amount: r2(e.total),
            count: e.count,
            percentage: totalExpenses > 0 ? r2((e.total / totalExpenses) * 100) : 0,
        }));

        // Timeline merged trend
        const dateKeySet = new Set([
            ...salesTimelineAgg.map((s) => s._id),
            ...expenseTimelineAgg.map((e) => e._id),
        ]);
        const sortedDateKeys = Array.from(dateKeySet).sort();
        const salesMap = Object.fromEntries(salesTimelineAgg.map((s) => [s._id, s.revenue]));
        const expMap   = Object.fromEntries(expenseTimelineAgg.map((e) => [e._id, e.expenses]));

        const timelineTrend = sortedDateKeys.map((key) => {
            const rev = r2(salesMap[key] ?? 0);
            const exp = r2(expMap[key] ?? 0);
            return {
                date: key,
                revenue: rev,
                expenses: exp,
                netProfit: r2(rev - exp),
            };
        });

        // Branch breakdown (if Overall mode)
        let branchBreakdown = null;
        if (!targetBranchId && branchList.length > 0) {
            const bSumMap  = Object.fromEntries((branchSalesAgg[0]?.summary ?? []).map((s) => [s._id.toString(), s]));
            const bCogsMap = Object.fromEntries((branchSalesAgg[0]?.cogs ?? []).map((c) => [c._id.toString(), c]));
            const bExpMap  = Object.fromEntries(branchExpensesAgg.map((e) => [e._id.toString(), e.expenses]));
            const bSalMap  = Object.fromEntries(branchSalariesAgg.map((s) => [s._id.toString(), s.salaries]));

            branchBreakdown = branchList.map((branch) => {
                const bId   = branch._id.toString();
                const s     = bSumMap[bId] ?? {};
                const c     = bCogsMap[bId] ?? {};
                const bRev  = r2(s.revenue ?? 0);
                const bCogs = r2(c.totalCOGS ?? 0);
                const bGross = r2(bRev - bCogs);
                const bExp  = r2(bExpMap[bId] ?? 0);
                const bSal  = r2(bSalMap[bId] ?? 0);
                const bNet  = r2(bGross - bExp - bSal);
                return {
                    branchId:        bId,
                    name:            branch.name,
                    code:            branch.code || "—",
                    revenue:         bRev,
                    cogs:            bCogs,
                    grossProfit:     bGross,
                    expenses:        bExp,
                    salaries:        bSal,
                    netProfit:       bNet,
                    saleCount:       s.saleCount ?? 0,
                    contributionPct: totalRevenue > 0 ? r2((bRev / totalRevenue) * 100) : 0,
                };
            });
        }

        return res.status(200).json({
            success: true,
            message: "Comprehensive executive report generated successfully",
            data: {
                meta: {
                    interval,
                    periodLabel,
                    startDate: start,
                    endDate: end,
                    generatedAt: new Date(),
                    scope: targetBranchId ? "single_branch" : "overall_business",
                    branch: branchInfo ? { id: branchInfo._id, name: branchInfo.name, code: branchInfo.code } : null,
                },
                financials: {
                    totalRevenue,
                    totalCOGS,
                    grossProfit,
                    grossMarginPct,
                    totalExpenses,
                    totalSalaries,
                    totalOperatingCost,
                    netProfit,
                    netMarginPct,
                },
                sales: {
                    saleCount,
                    totalUnitsSold,
                    averageTicketSize,
                    totalCashSales,
                    totalCreditSales,
                    totalDiscount,
                    cashSalesPct: totalRevenue > 0 ? r2((totalCashSales / totalRevenue) * 100) : 0,
                    creditSalesPct: totalRevenue > 0 ? r2((totalCreditSales / totalRevenue) * 100) : 0,
                },
                inventory,
                receivables,
                topItems,
                categoryBreakdown,
                expenseBreakdown,
                timelineTrend,
                branchBreakdown,
            },
        });
    } catch (err) {
        console.error("getComprehensiveReport error:", err);
        return fail(res, 500, "An unexpected error occurred while generating report");
    }
};
