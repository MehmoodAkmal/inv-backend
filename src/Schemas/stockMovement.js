import mongoose from "mongoose";

const stockMovementSchema = new mongoose.Schema({
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
    type: {
        type: String,
        required: true,
        enum: ["purchase", "sale", "transfer_in", "transfer_out", "adjustment"],
    },
    quantity: {
        type: Number,
        required: true,
        // Always a positive number — the direction is conveyed by `type`,
        // not by the sign of this field. e.g. a sale of 5 units stores 5 here,
        // not -5. This makes aggregation (summing movements) unambiguous.
    },
    previousQuantity: {
        type: Number,
        required: true, // stock level before this movement was applied
    },
    newQuantity: {
        type: Number,
        required: true, // stock level after this movement was applied
    },
    refId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        // Optional reference to the source document (Sale, StockTransfer, etc.)
        // No `ref` set here — the appropriate model depends on `type`,
        // so populate must be done manually in the controller when needed.
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
}, { timestamps: true }); // createdAt acts as the movement timestamp

// Efficient history queries: "show all movements for item X at branch Y,
// newest first" — the access pattern used in stock ledger views.
stockMovementSchema.index({ organizationId: 1, branchId: 1, itemId: 1, createdAt: -1 });

// ── Immutability guards ────────────────────────────────────────────────────
// StockMovement is a permanent audit trail. Block all update and delete
// operations at the Mongoose middleware level so no controller code can
// accidentally mutate or remove history records.

const IMMUTABLE_ERROR = "StockMovement records are immutable and cannot be modified or deleted.";

for (const hook of ["updateOne", "findOneAndUpdate", "updateMany"]) {
    stockMovementSchema.pre(hook, function () {
        throw new Error(IMMUTABLE_ERROR);
    });
}

for (const hook of ["deleteOne", "findOneAndDelete", "deleteMany"]) {
    stockMovementSchema.pre(hook, function () {
        throw new Error(IMMUTABLE_ERROR);
    });
}

const StockMovement = mongoose.model("StockMovement", stockMovementSchema);
export default StockMovement;
