import express from "express";
import { getProfitLoss, getBranchComparison, getLowStockAlert, getDashboardSummary } from "../controller/reportController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";
import joi from "joi";

// ── Date range validator middleware ────────────────────────────────────────
// Used on the two endpoints that require startDate + endDate.
// Validates query params and attaches the parsed values back to req.query
// so controllers can trust they are valid Date objects after this runs.
const dateRangeSchema = joi.object({
    startDate: joi.date().iso().required(),
    endDate:   joi.date().iso().min(joi.ref("startDate")).required()
               .messages({ "date.min": "endDate must not be before startDate" }),
}).unknown(true); // pass through other query params (branchId, etc.)

const validateDateRange = (req, res, next) => {
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    // Replace raw query strings with parsed Date objects for controller use
    req.query.startDate = value.startDate;
    req.query.endDate   = value.endDate;
    next();
};

const reportRouter = express.Router();

// GET /api/v1/reports/profit-loss — admin, manager
reportRouter.get(
    "/reports/profit-loss",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    validateDateRange,
    getProfitLoss
);

// GET /api/v1/reports/branch-comparison — admin only
reportRouter.get(
    "/reports/branch-comparison",
    authentication,
    authorization("admin"),
    validateDateRange,
    getBranchComparison
);

// GET /api/v1/reports/low-stock — admin, manager
reportRouter.get(
    "/reports/low-stock",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    getLowStockAlert
);

// GET /api/v1/reports/dashboard-summary — admin, manager, cashier
reportRouter.get(
    "/reports/dashboard-summary",
    authentication,
    authorization("admin", "manager", "cashier"),
    branchScope,
    getDashboardSummary
);

export default reportRouter;
