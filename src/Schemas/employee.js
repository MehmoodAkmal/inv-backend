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
    // Link back to the portal login account (set when auto-created from staff registration)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
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
        default: 0,
        min: 0,
        // The agreed monthly salary amount. Actual payments may differ (bonus,
        // advance, partial) and are tracked in SalaryPayment documents.
        // When auto-created from staff registration, defaults to 0.
        // Admin should update this after onboarding.
    },
    isActive: {
        type: Boolean,
        default: true, // soft-delete flag
    },
}, { timestamps: true });

// Primary query pattern: list employees for a specific branch within an org
employeeSchema.index({ organizationId: 1, branchId: 1 });
// Quick lookup: which employee belongs to this user account?
employeeSchema.index({ userId: 1 });

const Employee = mongoose.model("Employee", employeeSchema);
export default Employee;
