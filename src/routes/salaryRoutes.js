import express from "express";
import { recordSalaryPayment, getSalaryPayments } from "../controller/salaryController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";

const salaryRouter = express.Router();

// POST /api/v1/salary — admin, manager
salaryRouter.post(
    "/salary",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    recordSalaryPayment
);

// GET /api/v1/salary — admin, manager
salaryRouter.get(
    "/salary",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    getSalaryPayments
);

export default salaryRouter;
