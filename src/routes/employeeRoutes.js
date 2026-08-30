import express from "express";
import { createEmployee, getEmployees, updateEmployee, deactivateEmployee } from "../controller/employeeController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";

const employeeRouter = express.Router();

// POST/PUT/DELETE — admin only
employeeRouter.post(  "/employees",     authentication, authorization("admin"), createEmployee);
employeeRouter.put(   "/employees/:id", authentication, authorization("admin"), updateEmployee);
employeeRouter.delete("/employees/:id", authentication, authorization("admin"), deactivateEmployee);

// GET — admin + manager (manager needs employee list to record salary payments for their branch)
employeeRouter.get("/employees", authentication, authorization("admin", "manager"), branchScope, getEmployees);

export default employeeRouter;
