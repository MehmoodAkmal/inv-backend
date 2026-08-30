import joi from "joi";
import Customer from "../Schemas/customer.js";
import LedgerEntry from "../Schemas/ledgerEntry.js";
import Sale from "../Schemas/sale.js";

const objectId = () => joi.string().hex().length(24);

const recordPaymentSchema = joi.object({
    customerId:      objectId().required(),
    amount:          joi.number().min(0.01).required(),
    branchId:        objectId().required(),
    referenceSaleId: objectId().optional().allow(null, ""),
    note:            joi.string().max(500).optional().allow("", null),
});

const ledgerQuerySchema = joi.object({
    startDate: joi.date().iso().optional(),
    endDate:   joi.date().iso().optional(),
    page:      joi.number().integer().min(1).default(1),
    limit:     joi.number().integer().min(1).max(200).default(20),
});

const fail   = (res, status, message) => res.status(status).json({ success: false, message });
const round2 = (n) => Math.round(n * 100) / 100;

// ── 1. recordPayment ───────────────────────────────────────────────────────
export const recordPayment = async (req, res) => {
    try {
        const { error, value } = recordPaymentSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role, id: userId } = req.user;

        let branchId = value.branchId;
        if (role === "manager" || role === "cashier") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchId = req.allowedBranchId.toString();
        }

        const { customerId, amount, referenceSaleId, note } = value;
        const paymentAmount = round2(amount);

        // Verify customer
        const customer = await Customer.findOne({ _id: customerId, organizationId });
        if (!customer) return fail(res, 404, "Customer not found");

        // Verify sale reference if provided
        if (referenceSaleId) {
            const sale = await Sale.findOne({ _id: referenceSaleId, customerId, organizationId }).lean();
            if (!sale) return fail(res, 400, "Invalid sale reference");
        }

        // Block overpayment
        if (round2(paymentAmount) > round2(customer.currentBalance)) {
            return fail(res, 400,
                `Payment exceeds outstanding balance (balance: ${round2(customer.currentBalance).toFixed(2)})`
            );
        }

        const newBalance = round2(customer.currentBalance - paymentAmount);

        // Create ledger entry (create is always allowed — immutability only blocks update/delete)
        const entry = await LedgerEntry.create({
            organizationId,
            branchId,
            customerId,
            type:            "payment",
            amount:          paymentAmount,
            balanceAfter:    newBalance,
            referenceSaleId: referenceSaleId || null,
            note:            note || null,
            createdBy:       userId,
        });

        // Update customer balance
        await Customer.findByIdAndUpdate(customerId, { $set: { currentBalance: newBalance } });

        return res.status(201).json({
            success: true,
            message: "Payment recorded successfully",
            data:    { entry, currentBalance: newBalance },
        });
    } catch (err) {
        console.error("recordPayment error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 2. getCustomerLedger ───────────────────────────────────────────────────
export const getCustomerLedger = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const { customerId } = req.params;

        const { error, value } = ledgerQuerySchema.validate(req.query);
        if (error) return fail(res, 400, error.message);
        const { startDate, endDate, page, limit } = value;
        const skip = (page - 1) * limit;

        const customer = await Customer.findOne({ _id: customerId, organizationId }).lean();
        if (!customer) return fail(res, 404, "Customer not found");

        if (role === "manager" || role === "cashier") {
            const locked = req.allowedBranchId?.toString();
            if (!locked || customer.branchId?.toString() !== locked) {
                return fail(res, 404, "Customer not found");
            }
        }

        const filter = { organizationId, customerId };
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate)   filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }

        const [entries, total] = await Promise.all([
            LedgerEntry.find(filter)
                .populate("createdBy",       "firstName lastName")
                .populate("referenceSaleId", "_id totalAmount")
                .sort({ createdAt: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LedgerEntry.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            message: "Customer ledger fetched successfully",
            data: {
                customer: {
                    _id:            customer._id,
                    name:           customer.name,
                    phone:          customer.phone,
                    currentBalance: customer.currentBalance,
                    openingBalance: customer.openingBalance,
                },
                entries,
            },
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error("getCustomerLedger error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 3. getCustomersWithBalance ─────────────────────────────────────────────
export const getCustomersWithBalance = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const filter = { organizationId, currentBalance: { $gt: 0 }, isActive: true };

        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        } else if (req.query.branchId) {
            filter.branchId = req.query.branchId;
        }

        const customers = await Customer.find(filter)
            .select("name phone address branchId currentBalance openingBalance")
            .sort({ currentBalance: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Outstanding balances fetched successfully",
            data:    customers,
        });
    } catch (err) {
        console.error("getCustomersWithBalance error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
