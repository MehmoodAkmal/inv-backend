import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
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
    designation: {
        type: String,
        trim: true,
        default: null,
        // e.g. "Sales Staff", "Helper", "Driver" — free-form, not an enum,
        // so owners can describe roles in their own terminology.
    },
    monthlySalary: {
        type: Number,
        required: true,
        min: 0,
        // The agreed monthly salary amount. Actual payments may differ (bonus,
        // advance, partial) and are tracked in SalaryPayment documents.
    },
    isActive: {
        type: Boolean,
        default: true, // soft-delete flag
    },
}, { timestamps: true });

// Primary query pattern: list employees for a specific branch within an org
employeeSchema.index({ organizationId: 1, branchId: 1 });

const Employee = mongoose.model("Employee", employeeSchema);
export default Employee;
