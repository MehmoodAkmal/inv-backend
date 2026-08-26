import User from "../Schemas/auth.js";

export const createSuperAdmin = async () => {
    try {
        const superAdmin = await User.findOne({ role: "superAdmin" });
        if (superAdmin) {
            console.log("Super admin already exists");
            return;
        }

        const user = await User.create({
            firstName: process.env.SUPER_FIRST_NAME,
            lastName: process.env.SUPER_LAST_NAME,
            email: process.env.SUPER_EMAIL,
            password: process.env.SUPER_PASS, // plain — pre-save hook hashes it
            role: "superAdmin",
        });

        if (user) {
            console.log("Super admin created successfully");
        }
    } catch (error) {
        console.log("🚀 ~ createSuperAdmin ~ error:", error);
    }
};