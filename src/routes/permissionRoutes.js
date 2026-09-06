import express from "express";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import {
    getRolePermissions,
    updateRolePermissions,
    getUserPermissions,
    updateUserPermissions,
    resetUserPermissions,
    getMyPermissions,
} from "../controller/permissionController.js";

const permissionRouter = express.Router();
const guard = [authentication, authorization("admin")];

permissionRouter.get("/permissions/me", authentication, getMyPermissions);
permissionRouter.get("/permissions/roles/:role", ...guard, getRolePermissions);
permissionRouter.put("/permissions/roles/:role", ...guard, updateRolePermissions);
permissionRouter.get("/permissions/users/:userId", ...guard, getUserPermissions);
permissionRouter.put("/permissions/users/:userId", ...guard, updateUserPermissions);
permissionRouter.delete("/permissions/users/:userId", ...guard, resetUserPermissions);

export default permissionRouter;
