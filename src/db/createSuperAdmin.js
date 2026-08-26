import bcrypt from "bcrypt";
import User from "../Schemas/auth.js";

export const createSuperAdmin = async () => {
    try {
        const superAdmin = await User.findOne({ role: "superAdmin" });
        if (superAdmin) {
            console.log("superAdmin already exist");
        }
        const hashPassword = await bcrypt.hash(process.env.SUPER_PASS , 10)
        const user = await User.create({
            firstName: process.env.SUPER_FIRST_NAME,
            lastName: process.env.SUPER_LAST_NAME,
            email: process.env.SUPER_EMAIL,
            password: hashPassword,
            role: "superAdmin",
        })
        if (user) {
            console.log("Super admin is created Successfully")
        }
    } catch (error) {
        console.log("🚀 ~ createSuperAdmin ~ error:", error)

    }
}