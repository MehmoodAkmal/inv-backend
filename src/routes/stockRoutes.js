import express from "express";
import { addStock, getStockByBranch, getStockMovementHistory } from "../controller/stockController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";
import { checkPermission } from "../middleware/checkPermission.js";

const stockRouter = express.Router();

// POST /api/v1/stock/add — staff roles; permission middleware decides access
stockRouter.post(
    "/stock/add",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("stock", "addPurchase"),
    branchScope,
    addStock
);

// GET /api/v1/stock — admin, manager, cashier
stockRouter.get(
    "/stock",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("stock", "view"),
    branchScope,
    getStockByBranch
);

// GET /api/v1/stock/movements — staff roles; permission middleware decides access
stockRouter.get(
    "/stock/movements",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("stock", "view"),
    branchScope,
    getStockMovementHistory
);

export default stockRouter;
