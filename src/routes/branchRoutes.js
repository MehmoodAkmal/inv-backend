import express from "express";
import { createBranch, getBranches, updateBranch, deactivateBranch } from "../controller/branchController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { checkPermission } from "../middleware/checkPermission.js";

const branchRouter = express.Router();

branchRouter.post("/branches", authentication, authorization("admin", "manager", "cashier"), checkPermission("branches", "create"), createBranch);
branchRouter.get("/branches", authentication, authorization("admin", "manager", "cashier", "superAdmin"), checkPermission("branches", "view"), getBranches);
branchRouter.put("/branches/:id", authentication, authorization("admin", "manager", "cashier"), checkPermission("branches", "edit"), updateBranch);
branchRouter.delete("/branches/:id", authentication, authorization("admin", "manager", "cashier"), checkPermission("branches", "deactivate"), deactivateBranch);

export default branchRouter;
