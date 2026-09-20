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

// CORS configuration driven by CORS_ORIGIN environment variable
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : ["http://localhost:5173", "http://localhost:3000"];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/+$/, "");
    if (allowedOrigins.includes("*") || allowedOrigins.includes(normalized)) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-branch-id"],
};

app.use(helmet());
app.use(cors(corsOptions));
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

// Database connection middleware for resilient serverless cold-starts
app.use(async (req, res, next) => {
  try {
    await dbConnection();
    next();
  } catch (err) {
    console.error("MongoDB connection middleware failed:", err.message);
    return res.status(500).json({ success: false, message: "Database connection failed" });
  }
});

prepareRoutes(app);

// Public health check routes
app.get(["/", "/health", "/api/health"], (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Inventory Management API is healthy and operational",
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  if (err.message && err.message.startsWith("Not allowed by CORS")) {
    return res.status(403).json({ success: false, message: err.message });
  }
  console.error(err.stack);
  return res.status(500).json({ success: false, message: "Something went wrong" });
});

// Run HTTP listener only outside Vercel serverless functions
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => console.log(`app is listening on port ${PORT}`));
}

export default app;
