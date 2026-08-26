import express from "express";
import authRouter from "../routes/auth.js";

const prepareRoutes = (app) => {
    const prefix = "/api/v1"
    app.use(`${prefix}`, authRouter)
}

export default prepareRoutes;