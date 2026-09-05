import express from "express";
import {
    createItem,
    getItems,
    updateItem,
    deactivateItem,
} from "../controller/itemController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const itemRouter = express.Router();

itemRouter.post("/items",     authentication, authorization("admin"),            createItem);
itemRouter.get("/items",      authentication, authorization("admin", "manager", "cashier"), getItems);
itemRouter.put("/items/:id",  authentication, authorization("admin"),            updateItem);
itemRouter.delete("/items/:id", authentication, authorization("admin"),          deactivateItem);

export default itemRouter;
