import express from "express";
import { getOrganizations } from "../controller/organizationController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const organizationRouter = express.Router();

organizationRouter.get(
    "/organizations",
    authentication,
    authorization("superAdmin"),
    getOrganizations
);

export default organizationRouter;
