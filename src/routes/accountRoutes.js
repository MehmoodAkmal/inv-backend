import express from "express";
import {
  getAccountProfile,
  updateAccountProfile,
  changePassword,
  updateOrganizationSettings,
} from "../controller/accountController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const accountRouter = express.Router();

accountRouter.get("/account/profile", authentication, getAccountProfile);
accountRouter.put("/account/profile", authentication, updateAccountProfile);
accountRouter.put("/account/change-password", authentication, changePassword);
accountRouter.put(
  "/account/organization",
  authentication,
  authorization("admin"),
  updateOrganizationSettings
);

export default accountRouter;
