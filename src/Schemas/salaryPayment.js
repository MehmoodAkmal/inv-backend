import mongoose from "mongoose";

const salaryPaymentSchema = new mongoose.Schema({
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
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true,
    },
    month: {
        type: String,
        required: true,
        match: [/^\d{4}-(0[1-9]|1[0-2])$/, "month must be in YYYY-MM format"],
        // e.g. "2026-08". Stored as a string rather than a Date so that
        // "August 2026" is always unambiguous — no time zone drift, no
        // need to normalise to first-of-month before querying.
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01,
        // Actual amount paid — may be partial, full, or include bonus.
        // Does not need to equal Employee.monthlySalary.
        // On upsert (follow-up partial payment), the controller adds to
        // this field rather than replacing it, so it accumulates.
    },
    paidOn: {
        type: Date,
        required: true,
        default: Date.now,
    },
    status: {
        type: String,
        required: true,
        enum: ["paid", "partial", "pending"],
        default: "paid",
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

// One record per employee per month — follow-up payments update this
// document rather than inserting a duplicate row.
salaryPaymentSchema.index({ organizationId: 1, employeeId: 1, month: 1 }, { unique: true });

const SalaryPayment = mongoose.model("SalaryPayment", salaryPaymentSchema);
export default SalaryPayment;
