import Employee from "../Schemas/employee.js";
import SalaryPayment from "../Schemas/salaryPayment.js";
import { recordSalaryPaymentSchema, getSalaryPaymentsSchema } from "../validation/salary.js";

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// ── 1. recordSalaryPayment ─────────────────────────────────────────────────
// POST /salary — admin, manager
export const recordSalaryPayment = async (req, res) => {
    try {
        const { error, value } = recordSalaryPaymentSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role, id: userId } = req.user;
        const { employeeId, month, amount, status, note } = value;

        // Verify employee belongs to this org
        const employee = await Employee.findOne({ _id: employeeId, organizationId, isActive: true });
        if (!employee) return fail(res, 400, "Employee not found or does not belong to your organization");

        // Manager can only pay employees from their own branch
        if (role === "manager") {
            const locked = req.allowedBranchId?.toString();
            if (!locked || employee.branchId?.toString() !== locked) {
                return fail(res, 403, "You can only record salary payments for employees in your branch");
            }
        }

        const branchId = employee.branchId;

        // ── Upsert logic ───────────────────────────────────────────────────
        // One record per employee per month. If a partial payment was recorded
        // earlier this month, add to the existing amount rather than duplicating.
        const existing = await SalaryPayment.findOne({ organizationId, employeeId, month });

        let salaryPayment;

        if (existing) {
            // Follow-up payment — accumulate the amount and update status/note
            const newAmount = Math.round((existing.amount + amount) * 100) / 100;
            existing.amount  = newAmount;
            existing.status  = status;
            existing.paidOn  = new Date();
            existing.note    = note || existing.note;
            await existing.save();
            salaryPayment = existing;

            return res.status(200).json({
                success: true,
                message: "Salary payment updated successfully",
                data:    salaryPayment,
            });
        } else {
            // First payment for this employee this month — create a new record
            salaryPayment = await SalaryPayment.create({
                organizationId,
                branchId,
                employeeId,
                month,
                amount,
                paidOn:    new Date(),
                status,
                note:      note || null,
                createdBy: userId,
            });

            return res.status(201).json({
                success: true,
                message: "Salary payment recorded successfully",
                data:    salaryPayment,
            });
        }
    } catch (err) {
        // Handle duplicate key race condition (two concurrent inserts for same employee+month)
        if (err.code === 11000) {
            return fail(res, 409, "A salary payment for this employee and month already exists");
        }
        console.error("recordSalaryPayment error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 2. getSalaryPayments ───────────────────────────────────────────────────
// GET /salary — admin, manager
export const getSalaryPayments = async (req, res) => {
    try {
        const { organizationId, role } = req.user;

        const { error, value } = getSalaryPaymentsSchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { month, employeeId, page, limit } = value;
        const skip = (page - 1) * limit;

        const filter = { organizationId };

        // Branch scoping — manager is always locked to their own branch
        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        } else if (value.branchId) {
            // Admin can optionally filter by a specific branch
            filter.branchId = value.branchId;
        }

        if (month)      filter.month      = month;
        if (employeeId) filter.employeeId = employeeId;

        const [payments, total] = await Promise.all([
            SalaryPayment.find(filter)
                .populate("employeeId", "name designation monthlySalary")
                .populate("createdBy",  "firstName lastName")
                .sort({ month: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            SalaryPayment.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            message: "Salary payments fetched successfully",
            data:    payments,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("getSalaryPayments error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
