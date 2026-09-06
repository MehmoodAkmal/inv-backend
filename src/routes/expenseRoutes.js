import express from "express";
import { createExpense, getExpenses, updateExpense, deleteExpense } from "../controller/expenseController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";
import { checkPermission } from "../middleware/checkPermission.js";

const expenseRouter = express.Router();

// POST /api/v1/expenses — staff roles; permission middleware decides access
expenseRouter.post(
    "/expenses",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("expenses", "create"),
    branchScope,
    createExpense
);

// GET /api/v1/expenses — staff roles; permission middleware decides access
expenseRouter.get(
    "/expenses",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("expenses", "view"),
    branchScope,
    getExpenses
);

// PUT /api/v1/expenses/:id — staff roles; ownership rules are enforced in controller
expenseRouter.put(
    "/expenses/:id",
    authentication,
    authorization("admin", "manager", "cashier"),
    checkPermission("expenses", "edit"),
    branchScope,
    updateExpense
);

// DELETE /api/v1/expenses/:id — admin only
expenseRouter.delete(
    "/expenses/:id",
    authentication,
    authorization("admin"),
    deleteExpense
);

export default expenseRouter;
