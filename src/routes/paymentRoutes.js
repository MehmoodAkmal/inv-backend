import express from "express";
import {
    recordPayment,
    getCustomerLedger,
    getCustomersWithBalance,
} from "../controller/paymentController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";
import { checkPermission } from "../middleware/checkPermission.js";

const paymentRouter = express.Router();

// POST /api/v1/payments — admin, manager, cashier
paymentRouter.post(
    "/payments",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("payments", "record"),
    branchScope,
    recordPayment
);

// GET /api/v1/payments/customer/:customerId — admin, manager, cashier
// Must be registered BEFORE /payments/:id to prevent Express matching
// "customer" as a dynamic :id segment
paymentRouter.get(
    "/payments/customer/:customerId",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("payments", "viewLedger"),
    branchScope,
    getCustomerLedger
);

// GET /api/v1/payments/outstanding — admin, manager
paymentRouter.get(
    "/payments/outstanding",
    authentication,
    authorization("admin", "manager"),
    checkPermission("payments", "viewLedger"),
    branchScope,
    getCustomersWithBalance
);

export default paymentRouter;
