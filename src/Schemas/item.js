import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    sku: {
        type: String,
        trim: true,
        uppercase: true, // stored in uppercase, e.g. "SEED-001"
    },
    unit: {
        type: String,
        required: true,
        enum: ["kg", "bag", "piece", "litre", "box"],
        default: "piece",
    },
    costPrice: {
        type: Number,
        required: true,
        min: 0,
    },
    sellingPrice: {
        type: Number,
        required: true,
        min: 0,
        // NOTE — business rule hook point:
        // No schema-level constraint forces sellingPrice > costPrice because
        // a business may intentionally sell at a loss (clearance, spoilage, etc.).
        // A future "warn if selling below cost" rule should live in the controller
        // or a dedicated validation layer, not here, so it can be bypassed by
        // privileged roles (e.g. superAdmin) without touching the schema.
    },
    reorderLevel: {
        type: Number,
        default: 0,
        min: 0, // used later for low-stock alerts: alert when stock <= reorderLevel
    },
    isActive: {
        type: Boolean,
        default: true, // soft-delete flag instead of hard delete
    },
}, { timestamps: true });

// Compound index — primary access pattern is listing items by org + category
itemSchema.index({ organizationId: 1, categoryId: 1 });

// Pre-save hook — intentionally left with no sellingPrice > costPrice enforcement.
// If you want to emit a warning (not an error) in application logs when an item
// is saved below cost, add that logic here:
//
//   itemSchema.pre("save", function () {
//       if (this.sellingPrice < this.costPrice) {
//           console.warn(
//               `[Item] Selling below cost — item: ${this.name}, ` +
//               `cost: ${this.costPrice}, selling: ${this.sellingPrice}`
//           );
//       }
//   });
//
// To hard-block it instead, throw an error inside the hook.

const Item = mongoose.model("Item", itemSchema);
export default Item;
