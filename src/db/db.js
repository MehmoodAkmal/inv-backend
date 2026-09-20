import mongoose from "mongoose";
import { createSuperAdmin } from "./createSuperAdmin.js";
import User from "../Schemas/auth.js";
const dbConnection = async () => {
     try {
          await mongoose.connect(process.env.MONGODB_URI);
          console.log("Database Connected")
          const user = await User.findOne({ role: "superAdmin" });
          if (!user) {
               await createSuperAdmin()
          }
     } catch (error) {
          console.log(error.message);
     }
}

export default dbConnection;
