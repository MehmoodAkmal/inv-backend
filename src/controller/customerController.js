import Customer from "../Schemas/customer.js";
import Branch from "../Schemas/branch.js";
import { createCustomerSchema, updateCustomerSchema } from "../validation/customer.js";

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// POST /customers — admin, manager
export const createCustomer = async (req, res) => {
    try {
        const { error, value } = createCustomerSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role } = req.user;

        // Non-admin roles are locked to their own branch
        let branchId = value.branchId;
        if (role === "manager") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchId = req.allowedBranchId.toString();
        }

        // Verify branch belongs to this org and is active
        const branch = await Branch.findOne({ _id: branchId, organizationId, isActive: true });
        if (!branch) return fail(res, 400, "Invalid branch");

        const customer = await Customer.create({
            organizationId,
            branchId,
            name:           value.name,
            phone:          value.phone || null,
            address:        value.address || null,
            openingBalance: value.openingBalance || 0,
            currentBalance: value.openingBalance || 0,
        });

        return res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data:    customer,
        });
    } catch (err) {
        console.error("createCustomer error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// GET /customers — admin, manager, cashier
export const getCustomers = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const filter = { organizationId };

        // Manager/cashier scoped to their branch
        if (role === "manager" || role === "cashier") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        } else if (req.query.branchId) {
            filter.branchId = req.query.branchId;
        }

        if (req.query.includeInactive !== "true") filter.isActive = true;

        // Name search — prefix match within org
        if (req.query.search) {
            filter.name = { $regex: `^${req.query.search}`, $options: "i" };
        }

        const customers = await Customer.find(filter)
            .sort({ name: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Customers fetched successfully",
            data:    customers,
        });
    } catch (err) {
        console.error("getCustomers error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// PUT /customers/:id — admin, manager
export const updateCustomer = async (req, res) => {
    try {
        const { error, value } = updateCustomerSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId, role } = req.user;
        const { id } = req.params;

        const filter = { _id: id, organizationId };
        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        }

        const customer = await Customer.findOne(filter);
        if (!customer) return fail(res, 404, "Customer not found");

        const updated = await Customer.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Customer updated successfully",
            data:    updated,
        });
    } catch (err) {
        console.error("updateCustomer error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// DELETE /customers/:id — admin, manager (soft delete)
export const deactivateCustomer = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const { id } = req.params;

        const filter = { _id: id, organizationId };
        if (role === "manager") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        }

        const customer = await Customer.findOne(filter);
        if (!customer) return fail(res, 404, "Customer not found");
        if (!customer.isActive) return fail(res, 400, "Customer is already inactive");

        await Customer.findByIdAndUpdate(id, { $set: { isActive: false } });

        return res.status(200).json({
            success: true,
            message: "Customer deactivated successfully",
            data:    null,
        });
    } catch (err) {
        console.error("deactivateCustomer error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
