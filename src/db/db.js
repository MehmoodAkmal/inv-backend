import mongoose from "mongoose";
import { createSuperAdmin } from "./createSuperAdmin.js";
import User from "../Schemas/auth.js";
const dbConnection = async () => {
    try{
         await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/inventory");
         console.log("Database Connected")
         const user = await User.findOne({role: "superAdmin"});
         if (!user) {
            await createSuperAdmin()
         }
    }catch(error){
         console.log(error.message);
    }
}

export default dbConnection;
