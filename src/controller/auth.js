import bcrypt from "bcrypt"
import User from "../Schemas/auth.js";
import { loginSchema, signupSchema } from "../validation/auth.js"
import accessToken from "../utils/accesstoken.js";
import Organization from "../Schemas/organiztion.js";
import mongoose from "mongoose";

export const login = async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body)

        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            })
        }
        const { email, password } = value;
        const user = await User.findOne({ email: email }).select("+password");
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid Email or Password"
            })
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid Email or Password"
            })
        }
        const token = accessToken(
            {
                id: user._id,
                role: user.role,
                organizationId: user.organizationId,
                branchId: user.branchId,
            },
            process.env.ACCESS_SECRET,
            { expiresIn: '10h' }
        );
        if (!token) {
            return res.status(400).json({
                success: false,
                message: "jwt failed"
            })
        }
        return res.status(200).json({
            success: true,
            message: `Welcom Back ${user.firstName}`,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role
            },
            token: token
        })
    } catch (error) {
        console.log("🚀 ~ login ~ error:", error)
        return res.status(400).json({ message: error.message })
    }
}

export const signUp = async (req, res) => {
    try {
        const { error, value } = signupSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const { firstName, lastName, email, password, organizationName } = value;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "Email already exists" });
        }

        // Step 1: create the Organization
        const newOrg = await Organization.create(
            { name: organizationName },
        );

        // Step 2: create the owner user, tied to that org
        const newUser = await User.create(
            {
                firstName,
                lastName,
                email,
                password, // plain — pre-save hook hashes it
                role: "admin", // hardcoded, never from req.body
                organizationId: newOrg._id,
            }
        );

        const token = accessToken(
            {
                id: newUser._id,
                role: newUser.role,
                organizationId: newUser.organizationId,
                branchId: newUser.branchId,
            },
            process.env.ACCESS_SECRET,
            { expiresIn: '10h' }
        );

        return res.status(201).json({
            success: true,
            message: `Signup successful! Welcome ${newUser.firstName}`,
            token,
            user: {
                id: newUser._id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role,
                organizationId: newUser.organizationId,
            },
        });

    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    } finally {
    }
};