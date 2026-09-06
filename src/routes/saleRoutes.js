import express from "express";
import { createSale, getSales, getSaleById } from "../controller/saleController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";
import { checkPermission } from "../middleware/checkPermission.js";

const saleRouter = express.Router();

// POST /api/v1/sales — admin, manager, cashier
saleRouter.post(
    "/sales",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("sales", "create"),
    branchScope,
    createSale
);

// GET /api/v1/sales — admin, manager, cashier
saleRouter.get(
    "/sales",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("sales", "view"),
    branchScope,
    getSales
);

// GET /api/v1/sales/:id — admin, manager, cashier
saleRouter.get(
    "/sales/:id",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("sales", "view"),
    branchScope,
    getSaleById
);

export default saleRouter;
