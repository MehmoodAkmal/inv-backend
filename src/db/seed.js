/**
 * Seed script — Ali Traders demo data
 *
 * Usage:  node src/db/seed.js
 * Add to package.json scripts:  "seed": "node src/db/seed.js"
 *
 * Safe to re-run: clears all seeded collections first
 * (preserves any existing superAdmin user).
 */

import mongoose from "mongoose";
import "dotenv/config";

// ── Model imports ──────────────────────────────────────────────────────────
import Organization  from "../Schemas/organiztion.js";
import User          from "../Schemas/auth.js";
import Branch        from "../Schemas/branch.js";
import Category      from "../Schemas/category.js";
import Item          from "../Schemas/item.js";
import Stock         from "../Schemas/stock.js";
import StockMovement from "../Schemas/stockMovement.js";
import Customer      from "../Schemas/customer.js";
import Sale          from "../Schemas/sale.js";
import LedgerEntry   from "../Schemas/ledgerEntry.js";
import Expense       from "../Schemas/expense.js";
import Employee      from "../Schemas/employee.js";
import SalaryPayment from "../Schemas/salaryPayment.js";

// ── Helpers ────────────────────────────────────────────────────────────────
const r2   = (n) => Math.round(n * 100) / 100;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Returns a Date that is `daysAgo` days before now, with a random time */
function daysBack(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(Math.floor(Math.random() * 10) + 8, Math.floor(Math.random() * 60), 0, 0);
    return d;
}

/** Month string "YYYY-MM" */
function monthStr(monthsBack = 0) {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsBack);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function seed() {
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/inventory";
    console.log(`\n🌱  Connecting to ${uri} …`);
    await mongoose.connect(uri);
    console.log("✅  Connected.\n");

    // ── 1. Clear collections (keep superAdmin) ─────────────────────────────
    console.log("🗑   Clearing existing seed data …");
    // StockMovement and LedgerEntry have immutability guards on update/delete
    // query middleware — use deleteMany on the underlying collection directly
    // to bypass Mongoose middleware.
    await mongoose.connection.collection("stockmovements").deleteMany({});
    await mongoose.connection.collection("ledgerentries").deleteMany({});

    await Sale.deleteMany({});
    await Stock.deleteMany({});
    await Customer.deleteMany({});
    await Item.deleteMany({});
    await Category.deleteMany({});
    await Employee.deleteMany({});
    await SalaryPayment.deleteMany({});
    await Expense.deleteMany({});
    await Branch.deleteMany({});
    // Delete non-superAdmin users then the org
    await User.deleteMany({ role: { $ne: "superAdmin" } });
    await Organization.deleteMany({});
    console.log("✅  Collections cleared.\n");

    // ── 2. Organization ────────────────────────────────────────────────────
    const org = await Organization.create({
        name:             "Ali Traders",
        subscriptionPlan: "free",
        maxBranches:      5,
    });
    const orgId = org._id;

    // ── 3. Admin user ──────────────────────────────────────────────────────
    const admin = new User({
        firstName:      "Ali",
        lastName:       "Khan",
        email:          "ali@alitraders.com",
        password:       "password123",   // pre-save hook will hash this
        role:           "admin",
        organizationId: orgId,
        branchId:       null,
    });
    await admin.save();
    const adminId = admin._id;

    // ── 4. Branches ────────────────────────────────────────────────────────
    const [lahore, multan, faisalabad] = await Branch.insertMany([
        { organizationId: orgId, name: "Lahore Branch",     address: "Main Market, Lahore" },
        { organizationId: orgId, name: "Multan Branch",     address: "Hussain Agahi, Multan" },
        { organizationId: orgId, name: "Faisalabad Branch", address: "D-Ground, Faisalabad" },
    ]);
    const branches = [lahore, multan, faisalabad];

    // ── 5. Staff users (cashier per branch) ───────────────────────────────
    const cashierLahore = new User({
        firstName: "Bilal", lastName: "Ahmed",
        email: "bilal@alitraders.com", password: "password123",
        role: "cashier", organizationId: orgId, branchId: lahore._id,
    });
    const cashierMultan = new User({
        firstName: "Sajid", lastName: "Hussain",
        email: "sajid@alitraders.com", password: "password123",
        role: "cashier", organizationId: orgId, branchId: multan._id,
    });
    await cashierLahore.save();
    await cashierMultan.save();

    // ── 6. Categories ──────────────────────────────────────────────────────
    const [catSeeds, catFert, catPest] = await Category.insertMany([
        { organizationId: orgId, name: "Seeds" },
        { organizationId: orgId, name: "Fertilizer" },
        { organizationId: orgId, name: "Pesticides" },
    ]);

    // ── 7. Items ───────────────────────────────────────────────────────────
    const itemDefs = [
        // Seeds
        { categoryId: catSeeds._id, name: "Hybrid Maize Seed 1kg",     sku: "SEED-001", unit: "kg",  costPrice: 850,  sellingPrice: 1020, reorderLevel: 20 },
        { categoryId: catSeeds._id, name: "Wheat Seed Premium 40kg",   sku: "SEED-002", unit: "bag", costPrice: 2200, sellingPrice: 2600, reorderLevel: 10 },
        { categoryId: catSeeds._id, name: "Cotton Seed BT 1kg",        sku: "SEED-003", unit: "kg",  costPrice: 1100, sellingPrice: 1320, reorderLevel: 15 },
        { categoryId: catSeeds._id, name: "Rice Seed Basmati 40kg",    sku: "SEED-004", unit: "bag", costPrice: 3200, sellingPrice: 3800, reorderLevel: 8  },
        // Fertilizer
        { categoryId: catFert._id,  name: "DAP Fertilizer 50kg Bag",   sku: "FERT-001", unit: "bag", costPrice: 7500, sellingPrice: 8800, reorderLevel: 12 },
        { categoryId: catFert._id,  name: "Urea Fertilizer 50kg Bag",  sku: "FERT-002", unit: "bag", costPrice: 4200, sellingPrice: 4900, reorderLevel: 15 },
        { categoryId: catFert._id,  name: "NPK Fertilizer 25kg",       sku: "FERT-003", unit: "bag", costPrice: 3800, sellingPrice: 4500, reorderLevel: 10 },
        // Pesticides
        { categoryId: catPest._id,  name: "Pesticide Spray 1L",        sku: "PEST-001", unit: "litre", costPrice: 1800, sellingPrice: 2200, reorderLevel: 10 },
        { categoryId: catPest._id,  name: "Fungicide Powder 500g",     sku: "PEST-002", unit: "piece", costPrice: 950,  sellingPrice: 1150, reorderLevel: 8  },
    ];

    const items = await Item.insertMany(
        itemDefs.map((d) => ({ ...d, organizationId: orgId }))
    );

    // ── 8. Stock + purchase StockMovements ────────────────────────────────
    // Initial quantities per branch. A few are intentionally below reorderLevel.
    // stockMap[branchId][itemId] = current quantity (tracked in memory as sales deduct)
    const stockMap = {};   // stockMap[branchId.str][itemId.str] = qty
    const stockDocMap = {}; // stockDocMap[branchId.str][itemId.str] = Stock doc _id

    // qty[branchIndex][itemIndex]
    const initialQty = [
        // Lahore
        [45, 25, 30, 18, 20, 35, 22, 18, 14],
        // Multan — a few low-stock scenarios
        [8,   5, 12, 3,  22, 14,  9,  4,  2],  // items 0,1,3,7,8 below reorderLevel
        // Faisalabad
        [30, 20, 18, 12, 15, 28, 16, 12, 10],
    ];

    const stockDocs  = [];
    const stockMoves = [];

    for (let bi = 0; bi < branches.length; bi++) {
        const branch = branches[bi];
        stockMap[branch._id.toString()]    = {};
        stockDocMap[branch._id.toString()] = {};

        for (let ii = 0; ii < items.length; ii++) {
            const item = items[ii];
            const qty  = initialQty[bi][ii];

            const stockDoc = await Stock.create({
                organizationId: orgId,
                branchId:       branch._id,
                itemId:         item._id,
                quantity:       qty,
            });

            stockMap[branch._id.toString()][item._id.toString()]    = qty;
            stockDocMap[branch._id.toString()][item._id.toString()] = stockDoc._id;

            stockMoves.push({
                organizationId:   orgId,
                branchId:         branch._id,
                itemId:           item._id,
                type:             "purchase",
                quantity:         qty,
                previousQuantity: 0,
                newQuantity:      qty,
                refId:            null,
                note:             "Opening stock — seed",
                createdBy:        adminId,
            });
        }
    }

    // Insert stock movements — bypass Mongoose middleware to avoid immutability
    // pre-hook on future update calls (insertMany on create is fine)
    await mongoose.connection.collection("stockmovements").insertMany(
        stockMoves.map((m) => ({
            ...m,
            createdAt: daysBack(35),
            updatedAt: daysBack(35),
        }))
    );

    // ── 9. Customers ───────────────────────────────────────────────────────
    const customerDefs = [
        { branchId: lahore._id,     name: "Tariq Farms",        phone: "0300-1111111", openingBalance: 15000 },
        { branchId: lahore._id,     name: "Iqbal Brothers",     phone: "0301-2222222", openingBalance: 0 },
        { branchId: multan._id,     name: "Ghulam Agriculture", phone: "0302-3333333", openingBalance: 8500  },
        { branchId: multan._id,     name: "Nawaz Seed Store",   phone: "0303-4444444", openingBalance: 0 },
        { branchId: faisalabad._id, name: "Chaudhry Farms",     phone: "0304-5555555", openingBalance: 5000  },
    ];

    const customers = await Customer.insertMany(
        customerDefs.map((d) => ({
            ...d,
            organizationId: orgId,
            currentBalance: d.openingBalance,  // start = opening balance
        }))
    );

    // Track customer running balances in memory
    const customerBalance = {};
    customers.forEach((c) => { customerBalance[c._id.toString()] = c.currentBalance; });

    // ── 10. Sales + StockMovements + LedgerEntries ─────────────────────────
    // 18 sales spread across 30 days, 3 branches, mix cash/credit
    const saleDefs = [
        // Lahore — cash sales
        { branch: lahore, daysAgo: 28, type: "cash",   customer: null,       lines: [{item:0,qty:5},{item:4,qty:2}] },
        { branch: lahore, daysAgo: 25, type: "cash",   customer: null,       lines: [{item:1,qty:3}] },
        { branch: lahore, daysAgo: 22, type: "credit", customer: customers[0], lines: [{item:4,qty:3},{item:5,qty:4}], paid: 0 },
        { branch: lahore, daysAgo: 18, type: "cash",   customer: null,       lines: [{item:7,qty:4},{item:8,qty:3}] },
        { branch: lahore, daysAgo: 14, type: "credit", customer: customers[1], lines: [{item:0,qty:8},{item:2,qty:5}], paid: 5000 },
        { branch: lahore, daysAgo:  9, type: "cash",   customer: null,       lines: [{item:5,qty:5}] },
        { branch: lahore, daysAgo:  3, type: "credit", customer: customers[0], lines: [{item:6,qty:4}], paid: 0 },
        // Multan — cash + credit
        { branch: multan, daysAgo: 27, type: "cash",   customer: null,       lines: [{item:1,qty:2},{item:3,qty:2}] },
        { branch: multan, daysAgo: 20, type: "credit", customer: customers[2], lines: [{item:5,qty:3},{item:6,qty:2}], paid: 10000 },
        { branch: multan, daysAgo: 16, type: "cash",   customer: null,       lines: [{item:0,qty:3}] },
        { branch: multan, daysAgo: 11, type: "credit", customer: customers[3], lines: [{item:4,qty:2}], paid: 0 },
        { branch: multan, daysAgo:  5, type: "cash",   customer: null,       lines: [{item:7,qty:2},{item:8,qty:2}] },
        // Faisalabad
        { branch: faisalabad, daysAgo: 26, type: "cash",   customer: null,       lines: [{item:2,qty:4},{item:5,qty:3}] },
        { branch: faisalabad, daysAgo: 21, type: "credit", customer: customers[4], lines: [{item:4,qty:3},{item:1,qty:2}], paid: 8000 },
        { branch: faisalabad, daysAgo: 15, type: "cash",   customer: null,       lines: [{item:6,qty:3}] },
        { branch: faisalabad, daysAgo: 10, type: "credit", customer: customers[4], lines: [{item:0,qty:5},{item:3,qty:2}], paid: 0 },
        { branch: faisalabad, daysAgo:  6, type: "cash",   customer: null,       lines: [{item:7,qty:3},{item:5,qty:4}] },
        { branch: faisalabad, daysAgo:  1, type: "cash",   customer: null,       lines: [{item:8,qty:3}] },
    ];

    const createdSales = [];
    const saleMovements = [];
    const ledgerEntries = [];

    for (const def of saleDefs) {
        const branchIdStr = def.branch._id.toString();
        const saleDate    = daysBack(def.daysAgo);

        // Build line items from in-memory stock (ensure we don't oversell)
        const saleItems = [];
        let canCreate = true;

        for (const line of def.lines) {
            const item       = items[line.item];
            const itemIdStr  = item._id.toString();
            const available  = stockMap[branchIdStr]?.[itemIdStr] ?? 0;

            // Cap qty to available so we never go negative
            const qty = Math.min(line.qty, available);
            if (qty < 1) { canCreate = false; break; }

            const lineTotal = r2(qty * item.sellingPrice);
            saleItems.push({
                itemId:          item._id,
                itemName:        item.name,
                quantity:        qty,
                sellingPrice:    item.sellingPrice,
                costPriceAtSale: item.costPrice,
                lineTotal,
            });
        }

        if (!canCreate || saleItems.length === 0) continue;

        const subtotal    = r2(saleItems.reduce((s, l) => s + l.lineTotal, 0));
        const totalAmount = subtotal;  // no discount in seed data
        const amountPaid  = def.type === "cash" ? totalAmount : r2(def.paid ?? 0);
        const balanceDue  = r2(totalAmount - amountPaid);

        // Insert sale via native driver (bypass Mongoose model) to control createdAt
        const saleDoc = {
            organizationId: orgId,
            branchId:       def.branch._id,
            customerId:     def.customer?._id ?? null,
            paymentType:    def.type,
            items:          saleItems.map((si) => ({ ...si, _id: new mongoose.Types.ObjectId() })),
            subtotal,
            discount:       0,
            totalAmount,
            amountPaid,
            balanceDue,
            createdBy:      adminId,
            note:           null,
            createdAt:      saleDate,
            updatedAt:      saleDate,
        };

        const insertResult = await mongoose.connection.collection("sales").insertOne(saleDoc);
        const saleId = insertResult.insertedId;
        createdSales.push(saleId);

        // ── Deduct stock + queue StockMovements ──
        for (const si of saleItems) {
            const itemIdStr      = si.itemId.toString();
            const previousQty    = stockMap[branchIdStr][itemIdStr];
            const newQty         = previousQty - si.quantity;
            stockMap[branchIdStr][itemIdStr] = newQty;

            // Update Stock document
            await Stock.updateOne(
                { organizationId: orgId, branchId: def.branch._id, itemId: si.itemId },
                { $set: { quantity: newQty } }
            );

            saleMovements.push({
                organizationId:   orgId,
                branchId:         def.branch._id,
                itemId:           si.itemId,
                type:             "sale",
                quantity:         si.quantity,
                previousQuantity: previousQty,
                newQuantity:      newQty,
                refId:            saleId,
                note:             null,
                createdBy:        adminId,
                createdAt:        saleDate,
                updatedAt:        saleDate,
            });
        }

        // ── Credit ledger entries ──
        if (def.type === "credit" && def.customer) {
            const custIdStr = def.customer._id.toString();

            // Entry 1: sale increases balance
            const balAfterSale = r2(customerBalance[custIdStr] + totalAmount);
            customerBalance[custIdStr] = balAfterSale;

            ledgerEntries.push({
                organizationId:  orgId,
                branchId:        def.branch._id,
                customerId:      def.customer._id,
                type:            "sale",
                amount:          totalAmount,
                balanceAfter:    balAfterSale,
                referenceSaleId: saleId,
                note:            null,
                createdBy:       adminId,
                createdAt:       saleDate,
                updatedAt:       saleDate,
            });

            // Entry 2: partial payment at time of sale (if any)
            if (amountPaid > 0) {
                const balAfterPay = r2(balAfterSale - amountPaid);
                customerBalance[custIdStr] = balAfterPay;

                ledgerEntries.push({
                    organizationId:  orgId,
                    branchId:        def.branch._id,
                    customerId:      def.customer._id,
                    type:            "payment",
                    amount:          amountPaid,
                    balanceAfter:    balAfterPay,
                    referenceSaleId: saleId,
                    note:            "Partial payment at time of sale",
                    createdBy:       adminId,
                    createdAt:       new Date(saleDate.getTime() + 60_000),
                    updatedAt:       new Date(saleDate.getTime() + 60_000),
                });
            }
        }
    }

    // Bulk-insert movements and ledger entries via native driver
    if (saleMovements.length > 0) {
        await mongoose.connection.collection("stockmovements").insertMany(saleMovements);
    }
    if (ledgerEntries.length > 0) {
        await mongoose.connection.collection("ledgerentries").insertMany(ledgerEntries);
    }

    // Sync Customer.currentBalance with in-memory final balances
    for (const cust of customers) {
        const finalBalance = customerBalance[cust._id.toString()];
        await Customer.updateOne({ _id: cust._id }, { $set: { currentBalance: finalBalance } });
    }

    // ── 11. Expenses ───────────────────────────────────────────────────────
    const expenseDefs = [
        { branch: lahore,     daysAgo: 29, category: "rent",      amount: 35000, description: "Monthly shop rent — Lahore" },
        { branch: lahore,     daysAgo: 15, category: "utilities", amount: 4500,  description: "Electricity bill" },
        { branch: lahore,     daysAgo:  8, category: "transport", amount: 2200,  description: "Delivery van fuel" },
        { branch: multan,     daysAgo: 28, category: "rent",      amount: 28000, description: "Monthly shop rent — Multan" },
        { branch: multan,     daysAgo: 12, category: "supplies",  amount: 1800,  description: "Packing material" },
        { branch: multan,     daysAgo:  4, category: "transport", amount: 3100,  description: "Goods delivery charges" },
        { branch: faisalabad, daysAgo: 27, category: "rent",      amount: 22000, description: "Monthly shop rent — Faisalabad" },
        { branch: faisalabad, daysAgo: 20, category: "utilities", amount: 3800,  description: "Electricity + water" },
        { branch: faisalabad, daysAgo:  7, category: "misc",      amount: 1500,  description: "Miscellaneous office expenses" },
    ];

    const expenseInserts = expenseDefs.map((d) => ({
        organizationId: orgId,
        branchId:       d.branch._id,
        category:       d.category,
        amount:         d.amount,
        description:    d.description,
        date:           daysBack(d.daysAgo),
        createdBy:      adminId,
    }));

    await Expense.insertMany(expenseInserts);

    // ── 12. Employees ──────────────────────────────────────────────────────
    const employeeDefs = [
        { branch: lahore,     name: "Rashid Ali",      designation: "Sales Staff",  phone: "0311-1000001", monthlySalary: 25000 },
        { branch: lahore,     name: "Asif Raza",       designation: "Helper",       phone: "0311-1000002", monthlySalary: 18000 },
        { branch: multan,     name: "Kamran Shabbir",  designation: "Sales Staff",  phone: "0322-2000001", monthlySalary: 22000 },
        { branch: multan,     name: "Nadeem Iqbal",    designation: "Driver",       phone: "0322-2000002", monthlySalary: 20000 },
        { branch: faisalabad, name: "Imran Butt",      designation: "Sales Staff",  phone: "0333-3000001", monthlySalary: 23000 },
        { branch: faisalabad, name: "Zubair Ahmed",    designation: "Storekeeper",  phone: "0333-3000002", monthlySalary: 19000 },
    ];

    const employees = await Employee.insertMany(
        employeeDefs.map((d) => ({
            organizationId: orgId,
            branchId:       d.branch._id,
            name:           d.name,
            designation:    d.designation,
            phone:          d.phone,
            monthlySalary:  d.monthlySalary,
        }))
    );

    // ── 13. Salary Payments (current + previous month) ─────────────────────
    const thisMonth = monthStr(0);
    const lastMonth = monthStr(1);

    const salaryPaymentDocs = [];
    for (const emp of employees) {
        // Last month — all paid
        salaryPaymentDocs.push({
            organizationId: orgId,
            branchId:       emp.branchId,
            employeeId:     emp._id,
            month:          lastMonth,
            amount:         emp.monthlySalary,
            paidOn:         daysBack(15 + Math.floor(Math.random() * 5)),
            status:         "paid",
            note:           null,
            createdBy:      adminId,
        });
        // This month — paid
        salaryPaymentDocs.push({
            organizationId: orgId,
            branchId:       emp.branchId,
            employeeId:     emp._id,
            month:          thisMonth,
            amount:         emp.monthlySalary,
            paidOn:         daysBack(Math.floor(Math.random() * 5) + 1),
            status:         "paid",
            note:           null,
            createdBy:      adminId,
        });
    }

    await SalaryPayment.insertMany(salaryPaymentDocs);

    // ── Summary ────────────────────────────────────────────────────────────
    const [
        orgCount, branchCount, userCount, categoryCount, itemCount,
        stockCount, movCount, customerCount, saleCount,
        ledgerCount, expenseCount, employeeCount, salaryCount,
    ] = await Promise.all([
        Organization.countDocuments(),
        Branch.countDocuments(),
        User.countDocuments({ role: { $ne: "superAdmin" } }),
        Category.countDocuments(),
        Item.countDocuments(),
        Stock.countDocuments(),
        mongoose.connection.collection("stockmovements").countDocuments(),
        Customer.countDocuments(),
        mongoose.connection.collection("sales").countDocuments(),
        mongoose.connection.collection("ledgerentries").countDocuments(),
        Expense.countDocuments(),
        Employee.countDocuments(),
        SalaryPayment.countDocuments(),
    ]);

    console.log("═══════════════════════════════════════════════════");
    console.log("  ✅  Seed complete — Ali Traders demo data");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Organizations   : ${orgCount}`);
    console.log(`  Branches        : ${branchCount}`);
    console.log(`  Users (non-SA)  : ${userCount}`);
    console.log(`  Categories      : ${categoryCount}`);
    console.log(`  Items           : ${itemCount}`);
    console.log(`  Stock docs      : ${stockCount}`);
    console.log(`  Stock movements : ${movCount}`);
    console.log(`  Customers       : ${customerCount}`);
    console.log(`  Sales           : ${saleCount}`);
    console.log(`  Ledger entries  : ${ledgerCount}`);
    console.log(`  Expenses        : ${expenseCount}`);
    console.log(`  Employees       : ${employeeCount}`);
    console.log(`  Salary payments : ${salaryCount}`);
    console.log("───────────────────────────────────────────────────");
    console.log("  🔑  Login credentials");
    console.log("  Admin   : ali@alitraders.com  / password123");
    console.log("  Cashier : bilal@alitraders.com / password123  (Lahore Branch)");
    console.log("  Cashier : sajid@alitraders.com / password123  (Multan Branch)");
    console.log("═══════════════════════════════════════════════════\n");
}

// ── Run ────────────────────────────────────────────────────────────────────
seed()
    .catch((err) => {
        console.error("\n❌  Seed failed:", err.message);
        process.exit(1);
    })
    .finally(async () => {
        await mongoose.connection.close();
        console.log("🔌  Connection closed.");
    });
