import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
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
    name: {
        type: String,
        required: true,
        trim: true,
    },
    phone: {
        type: String,
        trim: true,
        default: null,
    },
    address: {
        type: String,
        trim: true,
        default: null,
    },
    openingBalance: {
        type: Number,
        default: 0,
        // Amount owed when the customer was first created — used for migrating
        // existing handwritten register records into the system. Never updated
        // after creation; historical reference only.
    },
    currentBalance: {
        type: Number,
        default: 0,
        // Denormalized running total of what this customer currently owes.
        // Updated atomically by the LedgerEntry controller on every transaction
        // (credit sale, payment received, manual adjustment) using $inc so that
        // reads never need to aggregate across the ledger entries table.
        // Positive = customer owes money. Negative = customer has credit.
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// Primary query pattern: list all customers for a branch within an org
customerSchema.index({ organizationId: 1, branchId: 1 });

// Search by name within an org — use a compound index rather than a text
// index so the query planner can use the leading organizationId field to
// restrict the scan to a single tenant before evaluating the name predicate.
// For case-insensitive search, apply collation at query time or normalise
// name to lowercase in the controller before saving.
customerSchema.index({ organizationId: 1, name: 1 });

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;
