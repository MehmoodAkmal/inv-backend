import express from "express";
import { recordSalaryPayment, getSalaryPayments } from "../controller/salaryController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";
import { checkPermission } from "../middleware/checkPermission.js";

const salaryRouter = express.Router();

// POST /api/v1/salary — staff roles; permission middleware decides access
salaryRouter.post(
    "/salary",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("salary", "record"),
    branchScope,
    recordSalaryPayment
);

// GET /api/v1/salary — staff roles; permission middleware decides access
salaryRouter.get(
    "/salary",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("salary", "view"),
    branchScope,
    getSalaryPayments
);

export default salaryRouter;
