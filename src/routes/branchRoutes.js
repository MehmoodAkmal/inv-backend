import express from "express";
import { createBranch, getBranches, updateBranch, deactivateBranch } from "../controller/branchController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const branchRouter = express.Router();

branchRouter.post("/branches", authentication, authorization("admin"), createBranch);
branchRouter.get("/branches", authentication, authorization("admin", "superAdmin"), getBranches);
branchRouter.put("/branches/:id", authentication, authorization("admin"), updateBranch);
branchRouter.delete("/branches/:id", authentication, authorization("admin"), deactivateBranch);

export default branchRouter;
