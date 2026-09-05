import express from "express";
import {
    createCategory,
    getCategories,
    updateCategory,
    deactivateCategory,
} from "../controller/categoryController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const categoryRouter = express.Router();

categoryRouter.post("/categories",     authentication, authorization("admin"),            createCategory);
categoryRouter.get("/categories",      authentication, authorization("admin", "manager", "cashier"), getCategories);
categoryRouter.put("/categories/:id",  authentication, authorization("admin"),            updateCategory);
categoryRouter.delete("/categories/:id", authentication, authorization("admin"),          deactivateCategory);

export default categoryRouter;
