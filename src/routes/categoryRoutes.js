import express from "express";
import {
    createCategory,
    getCategories,
    updateCategory,
    deactivateCategory,
} from "../controller/categoryController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { checkPermission } from "../middleware/checkPermission.js";

const categoryRouter = express.Router();

categoryRouter.post("/categories",     authentication, authorization("admin", "manager", "cashier"), checkPermission("categories", "create"), createCategory);
categoryRouter.get("/categories",      authentication, authorization("admin", "manager", "cashier"), checkPermission("categories", "view"), getCategories);
categoryRouter.put("/categories/:id",  authentication, authorization("admin", "manager", "cashier"), checkPermission("categories", "edit"), updateCategory);
categoryRouter.delete("/categories/:id", authentication, authorization("admin", "manager", "cashier"), checkPermission("categories", "deactivate"), deactivateCategory);

export default categoryRouter;
