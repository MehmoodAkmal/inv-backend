import express from "express";
import { createStaff, getStaff, updateStaff, deactivateStaff } from "../controller/staffController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const staffRouter = express.Router();

staffRouter.post("/staff", authentication, authorization("admin"), createStaff);
staffRouter.get("/staff", authentication, authorization("admin"), getStaff);
staffRouter.put("/staff/:id", authentication, authorization("admin"), updateStaff);
staffRouter.delete("/staff/:id", authentication, authorization("admin"), deactivateStaff);

export default staffRouter;
