import express from "express";
import { createExpense, getExpenses, updateExpense, deleteExpense } from "../controller/expenseController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";

const expenseRouter = express.Router();

// POST /api/v1/expenses — admin, manager
expenseRouter.post(
    "/expenses",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    createExpense
);

// GET /api/v1/expenses — admin, manager
expenseRouter.get(
    "/expenses",
    authentication,
    authorization("admin", "manager"),
    branchScope,
    getExpenses
);

// PUT /api/v1/expenses/:id — admin, manager (ownership rules enforced in controller)
expenseRouter.put(
    "/expenses/:id",
    authentication,
    authorization("admin", "manager"),
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
