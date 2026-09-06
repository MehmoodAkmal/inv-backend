import express from "express";
import {
    createItem,
    getItems,
    updateItem,
    deactivateItem,
} from "../controller/itemController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { checkPermission } from "../middleware/checkPermission.js";

const itemRouter = express.Router();

itemRouter.post("/items",     authentication, authorization("admin", "manager", "cashier"), checkPermission("items", "create"), createItem);
itemRouter.get("/items",      authentication, authorization("admin", "manager", "cashier"), checkPermission("items", "view"), getItems);
itemRouter.put("/items/:id",  authentication, authorization("admin", "manager", "cashier"), checkPermission("items", "edit"), updateItem);
itemRouter.delete("/items/:id", authentication, authorization("admin", "manager", "cashier"), checkPermission("items", "deactivate"), deactivateItem);

export default itemRouter;
