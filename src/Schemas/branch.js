import mongoose from "mongoose";

const branchSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true, // soft-delete flag instead of hard delete
    },
}, { timestamps: true });

// Compound index — most queries filter by tenant + active status together
branchSchema.index({ organizationId: 1, isActive: 1 });

const Branch = mongoose.model("Branch", branchSchema);
export default Branch;
