import express from "express";
import { createBranch, getBranches, getBranchById, updateBranch, deactivateBranch } from "../controller/branchController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { checkPermission } from "../middleware/checkPermission.js";
import { branchScope } from "../middleware/branchScope.js";

const branchRouter = express.Router();

branchRouter.post("/branches", authentication, authorization("admin", "manager", "cashier"), checkPermission("branches", "create"), createBranch);
branchRouter.get("/branches", authentication, authorization("admin", "manager", "cashier", "superAdmin"), checkPermission("branches", "view"), getBranches);
branchRouter.get("/branches/:id", authentication, branchScope, getBranchById);
branchRouter.put("/branches/:id", authentication, authorization("admin", "manager", "cashier"), checkPermission("branches", "edit"), updateBranch);
branchRouter.delete("/branches/:id", authentication, authorization("admin", "manager", "cashier"), checkPermission("branches", "deactivate"), deactivateBranch);

export default branchRouter;
