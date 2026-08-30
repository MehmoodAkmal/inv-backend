import express from "express";
import { createCustomer, getCustomers, updateCustomer, deactivateCustomer } from "../controller/customerController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";
import { branchScope } from "../middleware/branchScope.js";

const customerRouter = express.Router();

customerRouter.post(   "/customers",     authentication, authorization("admin", "manager"),            branchScope, createCustomer);
customerRouter.get(    "/customers",     authentication, authorization("admin", "manager", "cashier"), branchScope, getCustomers);
customerRouter.put(    "/customers/:id", authentication, authorization("admin", "manager"),            branchScope, updateCustomer);
customerRouter.delete( "/customers/:id", authentication, authorization("admin", "manager"),            branchScope, deactivateCustomer);

export default customerRouter;
