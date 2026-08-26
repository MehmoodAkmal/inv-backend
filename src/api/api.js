import express from "express";
import authRouter from "../routes/auth.js";
import branchRouter from "../routes/branchRoutes.js";
import staffRouter from "../routes/staffRoutes.js";

const prepareRoutes = (app) => {
    const prefix = "/api/v1"
    app.use(`${prefix}`, authRouter)
    app.use(`${prefix}`, branchRouter)
    app.use(`${prefix}`, staffRouter)
}

export default prepareRoutes;