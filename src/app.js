import crypto from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = crypto;

import express from "express";
import dbConnection from "./db/db.js";
import dotenv from "dotenv"
import prepareRoutes from "./api/api.js";
import { authentication } from "./middleware/authentication.js";
import { authorization } from "./middleware/authorization.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
const app = express();
dotenv.config();
app.use(helmet());
app.use(cors());
app.use(express.json());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX
    ? Number(process.env.RATE_LIMIT_MAX)
    : process.env.NODE_ENV === "production"
    ? 2000
    : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "You're sending too many requests. Please wait a moment and try again.",
  },
});
app.use(limiter);
dbConnection()
prepareRoutes(app);
app.get('/', authentication, authorization("superAdmin"), (req, res) => {
    return res.status(200).json({ success: true, message: "Backend is running" })
})
app.use((err, req, res, next) => {
    console.error(err.stack);
    return res.status(500).json({ success: false, message: "Something went wrong" });
});
app.listen(process.env.PORT || 8000, () => console.log("app is listening on port 8000"))
