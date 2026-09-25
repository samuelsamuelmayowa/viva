const { sequelize, Role, Permission } = require("../models");
const roles = {
    CEO: [
        "dashboard.read",
        "inventory.read",
        "products.read",
        "locations.read",
        "finance.read",
        "distributors.read",
        "approvals.read",
        "audit.read",
        "reports.read",
    ],
    Admin: [
        "dashboard.read",
        "inventory.read",
        "inventory.write",
        "products.read",
        "products.manage",
        "locations.read",
        "locations.manage",
        "finance.read",
        "expenses.write",
        "distributors.read",
        "distributors.manage",
        "approvals.read",
        "approvals.review",
        "audit.read",
        "reports.read",
        "users.manage",
        "system.read",
    ],
    Accountant: [
        "dashboard.read",
        "locations.read",
        "finance.read",
        "expenses.write",
        "approvals.read",
        "reports.read",
    ],
    Staff: [
        "dashboard.read",
        "inventory.read",
        "inventory.write",
        "products.read",
        "locations.read",
        "distributors.read",
        "approvals.read",
        "reports.read",
    ],
    Distributor: ["dashboard.read", "distribution.read"],
};
module.exports = async () =>
    sequelize.transaction(async (transaction) => {
        const map = {};
        for (const key of new Set(Object.values(roles).flat()))
            [map[key]] = await Permission.findOrCreate({
                where: { key },
                transaction,
            });
        for (const [name, keys] of Object.entries(roles)) {
            const [role, created] = await Role.findOrCreate({
                where: { name },
                defaults: { organizationWide: ["CEO", "Admin"].includes(name) },
                transaction,
            });
            if (created)
                await role.setPermissions(
                    keys.map((k) => map[k]),
                    { transaction },
                );
        }
    });
