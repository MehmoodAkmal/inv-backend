import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
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
    isActive: {
        type: Boolean,
        default: true, // soft-delete flag instead of hard delete
    },
}, { timestamps: true });

// Unique per organization — different orgs can each have "Seeds",
// but the same org cannot have two categories with the same name.
categorySchema.index({ organizationId: 1, name: 1 }, { unique: true });

const Category = mongoose.model("Category", categorySchema);
export default Category;
