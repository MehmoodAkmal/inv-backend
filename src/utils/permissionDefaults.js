/**
 * System-level permission defaults per role.
 * These are used when no org-level role default and no user override exists.
 * Admin is always fully permitted — not stored here.
 */
export const SYSTEM_DEFAULTS = {
    manager: {
        sales:      { view: true,  create: true  },
        stock:      { view: true,  addPurchase: true },
        customers:  { view: true,  create: true, edit: true, deactivate: true },
        payments:   { record: true, viewLedger: true },
        expenses:   { view: true,  create: true, edit: true },
        salary:     { view: true,  record: true },
        reports:    { dashboard: true, profitLoss: true, lowStock: true },
        categories: { view: true,  create: false, edit: false, deactivate: false },
        items:      { view: true,  create: false, edit: false, deactivate: false },
        branches:   { view: false, create: false, edit: false, deactivate: false },
    },
    cashier: {
        sales:      { view: true,  create: true  },
        stock:      { view: true,  addPurchase: false },
        customers:  { view: true,  create: false, edit: false, deactivate: false },
        payments:   { record: true, viewLedger: true },
        expenses:   { view: false, create: false, edit: false },
        salary:     { view: false, record: false },
        reports:    { dashboard: true, profitLoss: false, lowStock: false },
        categories: { view: true,  create: false, edit: false, deactivate: false },
        items:      { view: true,  create: false, edit: false, deactivate: false },
        branches:   { view: false, create: false, edit: false, deactivate: false },
    },
};

export const PERMISSION_CATALOG = {
    sales:      ["view", "create"],
    stock:      ["view", "addPurchase"],
    customers:  ["view", "create", "edit", "deactivate"],
    payments:   ["record", "viewLedger"],
    expenses:   ["view", "create", "edit"],
    salary:     ["view", "record"],
    reports:    ["dashboard", "profitLoss", "lowStock"],
    categories: ["view", "create", "edit", "deactivate"],
    items:      ["view", "create", "edit", "deactivate"],
    branches:   ["view", "create", "edit", "deactivate"],
};

// Drop unknown modules/actions and non-boolean values before persistence.
// This keeps the document sparse while preventing arbitrary data from being
// stored in a permissions record.
export function sanitizePermissions(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};

    const sanitized = {};
    for (const [module, actions] of Object.entries(PERMISSION_CATALOG)) {
        if (!input[module] || typeof input[module] !== "object") continue;
        for (const action of actions) {
            if (typeof input[module][action] !== "boolean") continue;
            if (!sanitized[module]) sanitized[module] = {};
            sanitized[module][action] = input[module][action];
        }
    }
    return sanitized;
}

/**
 * Merge permission layers (deepMerge, later layers win):
 *   systemDefault → roleDefault → userOverride
 * Only explicitly set boolean values in overrides are applied.
 */
export function resolvePermissions(role, roleDefault, userOverride) {
    if (role === "admin" || role === "superAdmin") return null; // unrestricted

    const base = SYSTEM_DEFAULTS[role] ?? {};

    const merged = JSON.parse(JSON.stringify(base)); // deep clone

    // Apply role default (org-level override of system defaults)
    if (roleDefault?.permissions) {
        deepMerge(merged, roleDefault.permissions);
    }

    // Apply user-specific override (overrides everything)
    if (userOverride?.permissions) {
        deepMerge(merged, userOverride.permissions);
    }

    return merged;
}

function deepMerge(target, source) {
    for (const key of Object.keys(source ?? {})) {
        if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else if (typeof source[key] === "boolean") {
            target[key] = source[key];
        }
    }
    return target;
}
