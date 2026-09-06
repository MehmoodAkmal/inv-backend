import joi from "joi";
import Sale from "../Schemas/sale.js";
import Customer from "../Schemas/customer.js";
import LedgerEntry from "../Schemas/ledgerEntry.js";
import Item from "../Schemas/item.js";
import Stock from "../Schemas/stock.js";
import StockMovement from "../Schemas/stockMovement.js";

const objectId = () => joi.string().hex().length(24);

const createSaleSchema = joi.object({
    branchId:    objectId().required(),
    paymentType: joi.string().valid("cash", "credit").required(),
    customerId:  objectId().optional().allow(null, ""),
    items: joi.array().items(
        joi.object({
            itemId:       objectId().required(),
            quantity:     joi.number().integer().min(1).required(),
            sellingPrice: joi.number().min(0).required(),
        })
    ).min(1).required(),
    amountPaid: joi.number().min(0).required(),
    discount:   joi.number().min(0).default(0),
    note:       joi.string().max(500).optional().allow("", null),
});

const getSalesQuerySchema = joi.object({
    branchId:    objectId().optional(),
    startDate:   joi.date().iso().optional(),
    endDate:     joi.date().iso().optional(),
    paymentType: joi.string().valid("cash", "credit").optional(),
    customerId:  objectId().optional(),
    page:        joi.number().integer().min(1).default(1),
    limit:       joi.number().integer().min(1).max(200).default(20),
});

const fail  = (res, status, message) => res.status(status).json({ success: false, message });
const round2 = (n) => Math.round(n * 100) / 100;

// ── 1. createSale ──────────────────────────────────────────────────────────
export const createSale = async (req, res) => {
    try {
        const { error, value } = createSaleSchema.validate(req.body, { abortEarly: true });
        if (error) return fail(res, 400, error.message);

        const { organizationId, role, id: userId } = req.user;

        let branchId = value.branchId;
        if (role === "manager" || role === "cashier") {
            if (!req.allowedBranchId) return fail(res, 400, "No branch assigned to your account");
            branchId = req.allowedBranchId.toString();
        }

        const { paymentType, customerId, amountPaid, discount, note } = value;

        if (paymentType === "credit" && !customerId) {
            return fail(res, 400, "Credit sales require a customer");
        }

        // ── Validate items ─────────────────────────────────────────────────
        const requestedItemIds = value.items.map((i) => i.itemId);
        const itemDocs = await Item.find({
            _id: { $in: requestedItemIds }, organizationId, isActive: true,
        }).lean();

        if (itemDocs.length !== requestedItemIds.length) {
            const foundIds = new Set(itemDocs.map((i) => i._id.toString()));
            const missing  = requestedItemIds.find((id) => !foundIds.has(id));
            return fail(res, 400, `Item not found or inactive: ${missing}`);
        }

        const itemMap = Object.fromEntries(itemDocs.map((i) => [i._id.toString(), i]));

        // ── Validate customer ──────────────────────────────────────────────
        let customer = null;
        if (customerId) {
            customer = await Customer.findOne({ _id: customerId, organizationId, isActive: true });
            if (!customer) return fail(res, 400, "Customer not found or does not belong to your organization");
        }

        // ── Build line items ───────────────────────────────────────────────
        const saleItems = value.items.map((line) => {
            const item      = itemMap[line.itemId];
            const lineTotal = round2(line.quantity * line.sellingPrice);
            return {
                itemId:          item._id,
                itemName:        item.name,
                quantity:        line.quantity,
                sellingPrice:    line.sellingPrice,
                costPriceAtSale: item.costPrice,
                lineTotal,
            };
        });

        const subtotal    = round2(saleItems.reduce((s, l) => s + l.lineTotal, 0));
        const totalAmount = round2(subtotal - (discount || 0));

        if (paymentType === "cash" && round2(amountPaid) !== totalAmount) {
            return fail(res, 400, `Cash sales require full payment. Expected ${totalAmount}, received ${amountPaid}`);
        }
        if (round2(amountPaid) > totalAmount) {
            return fail(res, 400, "Amount paid cannot exceed the total amount");
        }

        const balanceDue = round2(totalAmount - amountPaid);

        // ── Check stock availability for all items first ───────────────────
        const stockDocs = {};
        for (const line of saleItems) {
            const stockDoc = await Stock.findOne({
                organizationId, branchId, itemId: line.itemId,
            });
            const available = stockDoc?.quantity ?? 0;
            if (available < line.quantity) {
                return fail(res, 400, `Insufficient stock for "${line.itemName}" (available: ${available})`);
            }
            stockDocs[line.itemId.toString()] = stockDoc;
        }

        // ── Create Sale ────────────────────────────────────────────────────
        const sale = await Sale.create({
            organizationId,
            branchId,
            customerId:  customerId || null,
            paymentType,
            items:       saleItems,
            subtotal,
            discount:    discount || 0,
            totalAmount,
            amountPaid,
            balanceDue,
            createdBy:   userId,
            note:        note || null,
        });

        // ── Decrement stock + create StockMovements ────────────────────────
        for (const line of saleItems) {
            const stockDoc       = stockDocs[line.itemId.toString()];
            const previousQty    = stockDoc.quantity;
            const newQty         = previousQty - line.quantity;

            await Stock.updateOne(
                { _id: stockDoc._id },
                { $set: { quantity: newQty } }
            );

            await StockMovement.create({
                organizationId,
                branchId,
                itemId:          line.itemId,
                type:            "sale",
                quantity:        line.quantity,
                previousQuantity: previousQty,
                newQuantity:     newQty,
                refId:           sale._id,
                note:            note || null,
                createdBy:       userId,
            });
        }

        // ── Credit ledger entries ──────────────────────────────────────────
        if (paymentType === "credit") {
            const freshCustomer = await Customer.findById(customerId);

            const balanceAfterSale = round2(freshCustomer.currentBalance + totalAmount);

            await mongoose_insertLedger({
                organizationId, branchId, customerId,
                type:            "sale",
                amount:          totalAmount,
                balanceAfter:    balanceAfterSale,
                referenceSaleId: sale._id,
                note:            note || null,
                createdBy:       userId,
            });

            let finalBalance = balanceAfterSale;

            if (amountPaid > 0) {
                const balanceAfterPayment = round2(balanceAfterSale - amountPaid);

                await mongoose_insertLedger({
                    organizationId, branchId, customerId,
                    type:            "payment",
                    amount:          amountPaid,
                    balanceAfter:    balanceAfterPayment,
                    referenceSaleId: sale._id,
                    note:            "Partial payment at time of sale",
                    createdBy:       userId,
                });

                finalBalance = balanceAfterPayment;
            }

            await Customer.findByIdAndUpdate(customerId, { $set: { currentBalance: finalBalance } });
        }

        return res.status(201).json({
            success: true,
            message: "Sale recorded successfully",
            data:    sale,
        });
    } catch (err) {
        console.error("createSale error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// LedgerEntry.create bypasses immutability guards (those only block update/delete)
async function mongoose_insertLedger(doc) {
    return LedgerEntry.create(doc);
}

// ── 2. getSales ────────────────────────────────────────────────────────────
export const getSales = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const { error, value } = getSalesQuerySchema.validate(req.query);
        if (error) return fail(res, 400, error.message);

        const { startDate, endDate, paymentType, customerId, page, limit } = value;
        const skip = (page - 1) * limit;
        const filter = { organizationId };

        if (role === "admin") {
            if (value.branchId) filter.branchId = value.branchId;
        } else {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        }

        if (paymentType) filter.paymentType = paymentType;
        if (customerId)  filter.customerId  = customerId;

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate)   filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }

        const [sales, total] = await Promise.all([
            Sale.find(filter)
                .populate("customerId", "name phone")
                .populate("createdBy",  "firstName lastName")
                .select("-items")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Sale.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            message: "Sales fetched successfully",
            data:    sales,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error("getSales error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};

// ── 3. getSaleById ─────────────────────────────────────────────────────────
export const getSaleById = async (req, res) => {
    try {
        const { organizationId, role } = req.user;
        const { id } = req.params;
        const filter = { _id: id, organizationId };

        if (role !== "admin") {
            const locked = req.allowedBranchId;
            if (!locked) return fail(res, 400, "No branch assigned to your account");
            filter.branchId = locked;
        }

        const sale = await Sale.findOne(filter)
            .populate("customerId", "name phone address")
            .populate("createdBy",  "firstName lastName")
            .lean();

        if (!sale) return fail(res, 404, "Sale not found");

        return res.status(200).json({
            success: true,
            message: "Sale fetched successfully",
            data:    sale,
        });
    } catch (err) {
        console.error("getSaleById error:", err);
        return fail(res, 500, "An unexpected error occurred");
    }
};
