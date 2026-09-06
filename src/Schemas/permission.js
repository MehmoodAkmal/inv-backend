import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
    },
    // null = this is a ROLE DEFAULT record (applies to everyone with that role)
    // set  = this is a USER OVERRIDE record (applies only to this user)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    // "manager" | "cashier" — admin is always unrestricted, superAdmin is platform-level
    role: {
        type: String,
        enum: ["manager", "cashier"],
        required: true,
    },
    // Intentionally sparse. Defaults must not be materialized here: a missing
    // value inherits from the system/role layer during resolution.
    permissions: { type: mongoose.Schema.Types.Mixed, default: undefined },
}, { timestamps: true });

// One role-default per org per role, one user-override per user
permissionSchema.index({ organizationId: 1, role: 1, userId: 1 }, { unique: true });

const Permission = mongoose.model("Permission", permissionSchema);
export default Permission;
