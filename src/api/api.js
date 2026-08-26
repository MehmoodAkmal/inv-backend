import express from "express";
import authRouter from "../routes/auth.js";
import branchRouter from "../routes/branchRoutes.js";

const prepareRoutes = (app) => {
    const prefix = "/api/v1"
    app.use(`${prefix}`, authRouter)
    app.use(`${prefix}`, branchRouter)
}

export default prepareRoutes;