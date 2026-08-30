import mongoose from "mongoose";

const EXPENSE_CATEGORIES = ["rent", "utilities", "transport", "maintenance", "supplies", "misc"];

const expenseSchema = new mongoose.Schema({
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
    category: {
        type: String,
        required: true,
        enum: EXPENSE_CATEGORIES,
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01,
    },
    description: {
        type: String,
        trim: true,
        default: null,
    },
    date: {
        type: Date,
        required: true,
        default: Date.now,
        // The date the expense actually occurred — may differ from createdAt
        // if the entry is made retroactively (e.g. entering last week's rent).
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, { timestamps: true });

// Primary reporting query: expenses for a branch within a date range
expenseSchema.index({ organizationId: 1, branchId: 1, date: -1 });

const Expense = mongoose.model("Expense", expenseSchema);
export default Expense;
