import mongoose from "mongoose";
import { createSuperAdmin } from "./createSuperAdmin.js";
import User from "../Schemas/auth.js";

let isConnecting = null;

const dbConnection = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (isConnecting) {
    return isConnecting;
  }

  isConnecting = (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Database Connected");
      const user = await User.findOne({ role: "superAdmin" });
      if (!user) {
        await createSuperAdmin();
      }
      return mongoose.connection;
    } catch (error) {
      console.error("Database connection error:", error.message);
      throw error;
    } finally {
      isConnecting = null;
    }
  })();

  return isConnecting;
};

export default dbConnection;
