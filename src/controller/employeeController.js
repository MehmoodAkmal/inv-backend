import Employee from "../Schemas/employee.js";
import Branch from "../Schemas/branch.js";
import { createEmployeeSchema, updateEmployeeSchema } from "../validation/employee.js";

const fail = (res, status, message) =>
    res.status(status).json({ success: false, message });

// POST /employees — admin only
export const createEmployee = async (req, res) => {
    try {
        const { error, value } = createEmployeeSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId } = req.user;

        // Verify branch belongs to this org and is active
        const branch = await Branch.findOne({ _id: value.branchId, organizationId, isActive: true });
        if (!branch) return fail(res, 400, "Invalid branch");

        const employee = await Employee.create({
            organizationId,
            branchId:      value.branchId,
            name:          value.name,
            phone:         value.phone || null,
            designation:   value.designation || null,
            monthlySalary: value.monthlySalary,
        });

        return res.status(201).json({
            success: true,
            message: "Employee created successfully",
            data:    employee,
        });
    } catch (err) {
        console.error("createEmployee error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// GET /employees — admin only
export const getEmployees = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const filter = { organizationId };

        if (req.query.branchId)             filter.branchId = req.query.branchId;
        if (req.query.includeInactive !== "true") filter.isActive = true;

        if (req.query.search) {
            filter.name = { $regex: `^${req.query.search}`, $options: "i" };
        }

        const employees = await Employee.find(filter)
            .sort({ name: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Employees fetched successfully",
            data:    employees,
        });
    } catch (err) {
        console.error("getEmployees error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// PUT /employees/:id — admin only
export const updateEmployee = async (req, res) => {
    try {
        const { error, value } = updateEmployeeSchema.validate(req.body);
        if (error) return fail(res, 400, error.message);

        const { organizationId } = req.user;
        const { id } = req.params;

        const employee = await Employee.findOne({ _id: id, organizationId });
        if (!employee) return fail(res, 404, "Employee not found");

        const updated = await Employee.findByIdAndUpdate(
            id,
            { $set: value },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data:    updated,
        });
    } catch (err) {
        console.error("updateEmployee error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// DELETE /employees/:id — admin only (soft delete)
export const deactivateEmployee = async (req, res) => {
    try {
        const { organizationId } = req.user;
        const { id } = req.params;

        const employee = await Employee.findOne({ _id: id, organizationId });
        if (!employee)         return fail(res, 404, "Employee not found");
        if (!employee.isActive) return fail(res, 400, "Employee is already inactive");

        await Employee.findByIdAndUpdate(id, { $set: { isActive: false } });

        return res.status(200).json({
            success: true,
            message: "Employee deactivated successfully",
            data:    null,
        });
    } catch (err) {
        console.error("deactivateEmployee error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
