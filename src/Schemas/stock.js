import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        required: true,
    },
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
}, { timestamps: true });

// One stock document per item per branch — quantity is updated in place,
// never by inserting a duplicate row. organizationId is included in the
// index so the compound key aligns with tenant-scoped queries and
// the unique constraint is globally unambiguous.
stockSchema.index({ organizationId: 1, branchId: 1, itemId: 1 }, { unique: true });

const Stock = mongoose.model("Stock", stockSchema);
export default Stock;
