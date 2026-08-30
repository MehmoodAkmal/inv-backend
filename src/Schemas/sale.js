import mongoose from "mongoose";

// ── Sale line item (subdocument, not a separate collection) ───────────────
// Price and name fields are snapshots taken at the time of sale so that
// historical reports remain accurate even if the item is later renamed,
// repriced, or soft-deleted.
const saleItemSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
        required: true,
    },
    itemName: {
        type: String,
        required: true,
        trim: true,
        // Snapshot — do not populate itemId for display; use this field instead.
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    sellingPrice: {
        type: Number,
        required: true,
        min: 0,
        // Actual price charged — may differ from Item.sellingPrice if a
        // per-sale discount or override was applied.
    },
    costPriceAtSale: {
        type: Number,
        required: true,
        min: 0,
        // Snapshot of Item.costPrice at time of sale.
        // Required for accurate gross-profit reporting; if only the current
        // Item.costPrice were used, historical reports would silently drift
        // whenever an item's cost is updated.
    },
    lineTotal: {
        type: Number,
        required: true,
        // quantity * sellingPrice — pre-computed and stored so aggregation
        // queries don't need to multiply on every read.
    },
}, { _id: true }); // keep _id on subdocs so line items can be referenced individually

// ── Sale document ─────────────────────────────────────────────────────────
const saleSchema = new mongoose.Schema({
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
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        default: null,
        // null = anonymous cash sale (no customer record required).
        // For credit sales this must be set so the ledger and balance can
        // be linked back to the customer.
    },
    paymentType: {
        type: String,
        required: true,
        enum: ["cash", "credit"],
    },
    items: {
        type: [saleItemSchema],
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length > 0,
            message:   "A sale must contain at least one item",
        },
    },
    subtotal: {
        type: Number,
        required: true,
        // Sum of all line totals before discount.
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalAmount: {
        type: Number,
        required: true,
        // subtotal - discount. The canonical amount the customer is charged.
    },
    amountPaid: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        // Cash sales: should equal totalAmount (full payment at point of sale).
        // Credit sales: may be 0 (fully on credit) or a partial upfront payment.
        // Further payments are recorded as LedgerEntry documents, not here.
    },
    balanceDue: {
        type: Number,
        default: 0,
        min: 0,
        // totalAmount - amountPaid at the time of sale creation.
        // For cash sales this will always be 0.
        // For credit sales this seeds the customer's running balance; subsequent
        // LedgerEntry records track payments and reduce Customer.currentBalance.
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    note: {
        type: String,
        trim: true,
        default: null,
    },
}, { timestamps: true });

// Daily/range sales reports and branch-level listing — most frequent query
saleSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

// Customer statement view — "show all sales for customer X in this org"
saleSchema.index({ organizationId: 1, customerId: 1 });

const Sale = mongoose.model("Sale", saleSchema);
export default Sale;
