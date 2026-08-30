import mongoose from "mongoose";

const ledgerEntrySchema = new mongoose.Schema({
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
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
    },
    type: {
        type: String,
        required: true,
        enum: ["sale", "payment"],
        // "sale"    — customer received goods on credit; their balance increases
        // "payment" — customer paid some or all of what they owe; balance decreases
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
        // Always a positive number. Direction is conveyed by `type`, not sign.
        // This keeps aggregations (total sales on credit, total payments received)
        // unambiguous — same convention as StockMovement.quantity.
    },
    balanceAfter: {
        type: Number,
        required: true,
        // Snapshot of Customer.currentBalance immediately after this entry was
        // applied. Enables accurate point-in-time statement reconstruction even
        // if the customer's current balance changes later. Never recomputed.
    },
    referenceSaleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sale",
        default: null,
        // Set when type is "sale" (links to the originating Sale document) or
        // when a payment is applied against a specific outstanding sale.
        // null is valid for general (unallocated) payments.
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
}, { timestamps: true }); // createdAt is the canonical transaction timestamp

// Customer statement query: "show full ledger for customer X, newest first"
ledgerEntrySchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });

// ── Immutability guards ────────────────────────────────────────────────────
// LedgerEntry is a permanent financial audit trail. Any post-creation
// mutation would corrupt the integrity of customer statements and balance
// history. Block all update and delete paths at the Mongoose middleware level.

const IMMUTABLE_ERROR = "LedgerEntry records are immutable and cannot be modified or deleted.";

for (const hook of ["updateOne", "findOneAndUpdate", "updateMany"]) {
    ledgerEntrySchema.pre(hook, function () {
        throw new Error(IMMUTABLE_ERROR);
    });
}

for (const hook of ["deleteOne", "findOneAndDelete", "deleteMany"]) {
    ledgerEntrySchema.pre(hook, function () {
        throw new Error(IMMUTABLE_ERROR);
    });
}

const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);
export default LedgerEntry;
