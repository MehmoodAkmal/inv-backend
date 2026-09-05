import express from "express";
import {
    getPlatformStats,
    getOrganizations,
    getOrganizationDetail,
    toggleOrganizationStatus,
    updateOrganizationPlan,
    getSignupTrend,
    getMostActiveOrganizations,
    getAllUsers,
} from "../controller/superAdminController.js";
import { authentication } from "../middleware/authentication.js";
import { authorization } from "../middleware/authorization.js";

const superAdminRouter = express.Router();

// Every route in this file requires superAdmin authentication.
// The authorization middleware rejects all other roles with 403.
const guard = [authentication, authorization("superAdmin")];

// Platform-level stats (counts only — no business data)
superAdminRouter.get("/admin/stats",                             ...guard, getPlatformStats);

// Organization list (paginated, filtered, sorted — meta only)
superAdminRouter.get("/admin/organizations",                     ...guard, getOrganizations);

// Single organization detail (meta + user/branch lists — no business data)
superAdminRouter.get("/admin/organizations/:id",                 ...guard, getOrganizationDetail);

// Flip isActive: true <-> false (suspend / reactivate)
superAdminRouter.patch("/admin/organizations/:id/toggle-status", ...guard, toggleOrganizationStatus);

// Update subscriptionPlan + maxBranches
superAdminRouter.patch("/admin/organizations/:id/plan",          ...guard, updateOrganizationPlan);

// Daily signup counts over the last N days (for trend chart)
superAdminRouter.get("/admin/signup-trend",                      ...guard, getSignupTrend);

// Top N orgs by sale count (COUNT only — no monetary data)
superAdminRouter.get("/admin/active-organizations",              ...guard, getMostActiveOrganizations);

// All users across all orgs (identity + role only — no business data)
superAdminRouter.get("/admin/users", ...guard, getAllUsers);

export default superAdminRouter;
