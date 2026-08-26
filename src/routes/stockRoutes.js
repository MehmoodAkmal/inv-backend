import express from "express";
import { addStock, getStockByBranch, getStockMovementHistory } from "../controller/stockController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";

const stockRouter = express.Router();

// POST /api/v1/stock/add — admin, manager
stockRouter.post(
    "/stock/add",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    addStock
);

// GET /api/v1/stock — admin, manager, cashier
stockRouter.get(
    "/stock",
    authentication,
    authorization("admin", "manager", "cashier"),
    branchScope,
    getStockByBranch
);

// GET /api/v1/stock/movements — admin, manager
stockRouter.get(
    "/stock/movements",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    getStockMovementHistory
);

export default stockRouter;
