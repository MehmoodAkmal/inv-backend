import express from "express";
import authRouter from "../routes/auth.js";
import branchRouter from "../routes/branchRoutes.js";
import staffRouter from "../routes/staffRoutes.js";
import categoryRouter from "../routes/categoryRoutes.js";
import itemRouter from "../routes/itemRoutes.js";
import stockRouter from "../routes/stockRoutes.js";

const prepareRoutes = (app) => {
    const prefix = "/api/v1"
    app.use(`${prefix}`, authRouter)
    app.use(`${prefix}`, branchRouter)
    app.use(`${prefix}`, staffRouter)
    app.use(`${prefix}`, categoryRouter)
    app.use(`${prefix}`, itemRouter)
    app.use(`${prefix}`, stockRouter)
}

export default prepareRoutes;
