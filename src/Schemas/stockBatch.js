import mongoose from "mongoose";

const stockBatchSchema = new mongoose.Schema({
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
    batchNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    costPrice: {
        type: Number,
        required: true,
        min: 0,
    },
    initialQuantity: {
        type: Number,
        required: true,
        min: 1,
    },
    remainingQuantity: {
        type: Number,
        required: true,
        min: 0,
    },
    status: {
        type: String,
        enum: ["active", "depleted"],
        default: "active",
    },
    note: {
        type: String,
        trim: true,
        default: null,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, { timestamps: true });

// Compound index for ultra-fast FIFO retrieval (oldest active batches first)
stockBatchSchema.index({
    organizationId: 1,
    branchId: 1,
    itemId: 1,
    status: 1,
    createdAt: 1,
});

// Index on batch number for quick lookups
stockBatchSchema.index({ organizationId: 1, batchNumber: 1 });

const StockBatch = mongoose.model("StockBatch", stockBatchSchema);
export default StockBatch;
