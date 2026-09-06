import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true, // super admin can flip this to suspend a tenant
    },
    subscriptionPlan: {
        type: String,
        enum: ["free", "basic", "pro"],
        default: "free",
    },
    subscriptionStatus: {
        type: String,
        enum: ["trial", "active", "expired", "cancelled"],
        default: "trial",
    },
    maxBranches: {
        type: Number,
        default: 1, // free tier limit, for example
    },
}, { timestamps: true });

const Organization = mongoose.model("Organization", organizationSchema);
export default Organization;