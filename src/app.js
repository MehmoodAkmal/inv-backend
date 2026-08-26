import express from "express";
import dbConnection from "./db/db.js";
import dotenv from "dotenv"
import prepareRoutes from "./api/api.js";
import { authentication } from "./middleware/authentication.js";
import { authorization } from "./middleware/authorization.js";
const app = express();
app.use(express.json())
dotenv.config();
dbConnection()
prepareRoutes(app);






app.get('/' , authentication , authorization("superAdmin"), (req , res) => {
    return res.status(200).json({
        success: true,
        message: "Backend is running"
    })
})




app.listen(process.env.PORT, ()=>console.log("app is listning on port 8000"))