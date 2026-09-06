import express from "express";
import authRouter      from "../routes/auth.js";
import branchRouter    from "../routes/branchRoutes.js";
import staffRouter     from "../routes/staffRoutes.js";
import categoryRouter  from "../routes/categoryRoutes.js";
import itemRouter      from "../routes/itemRoutes.js";
import stockRouter     from "../routes/stockRoutes.js";
import saleRouter      from "../routes/saleRoutes.js";
import customerRouter  from "../routes/customerRoutes.js";
import paymentRouter   from "../routes/paymentRoutes.js";
import expenseRouter   from "../routes/expenseRoutes.js";
import employeeRouter  from "../routes/employeeRoutes.js";
import salaryRouter    from "../routes/salaryRoutes.js";
import reportRouter    from "../routes/reportRoutes.js";
import organizationRouter from "../routes/organizationRoutes.js";
import superAdminRouter   from "../routes/superAdminRoutes.js";
import permissionRouter   from "../routes/permissionRoutes.js";

const prepareRoutes = (app) => {
    const prefix = "/api/v1"
    app.use(`${prefix}`, authRouter)
    app.use(`${prefix}`, branchRouter)
    app.use(`${prefix}`, staffRouter)
    app.use(`${prefix}`, permissionRouter)
    app.use(`${prefix}`, categoryRouter)
    app.use(`${prefix}`, itemRouter)
    app.use(`${prefix}`, stockRouter)
    app.use(`${prefix}`, customerRouter)
    app.use(`${prefix}`, saleRouter)
    app.use(`${prefix}`, paymentRouter)
    app.use(`${prefix}`, expenseRouter)
    app.use(`${prefix}`, employeeRouter)
    app.use(`${prefix}`, salaryRouter)
    app.use(`${prefix}`, reportRouter)
    app.use(`${prefix}`, organizationRouter)
    app.use(`${prefix}`, superAdminRouter)
}

export default prepareRoutes;
