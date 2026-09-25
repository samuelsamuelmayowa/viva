const { z } = require("zod");
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(255);
const shortOptional = z.string().trim().max(255).optional();
const optional = z.string().trim().max(2000).optional();
const decimal = z.coerce
    .number()
    .finite()
    .nonnegative()
    .max(999999999)
    .multipleOf(0.001);
const money = z.coerce
    .number()
    .finite()
    .nonnegative()
    .max(999999999)
    .multipleOf(0.01);
const schemas = {
    movements: z
        .object({
            reference: shortOptional,
            counterparty: shortOptional,
            delivery: optional,
            notes: optional,
        })
        .strict(),
    locations: z
        .object({
            name: text,
            state: text,
            city: text,
            address: optional,
            kind: z.enum(["branch", "distribution", "head_office"]).default("branch"),
            active: z.boolean().optional(),
        })
        .strict(),
    warehouses: z
        .object({
            name: text,
            code: text.max(32),
            locationId: uuid,
            address: optional,
            active: z.boolean().optional(),
        })
        .strict(),
    products: z
        .object({
            name: text,
            sku: text.max(64),
            barcode: shortOptional,
            categoryId: uuid.nullable().optional(),
            unit: text.max(32),
            costPrice: money,
            sellingPrice: money,
            minimumStock: decimal,
            description: optional,
            active: z.boolean().optional(),
        })
        .strict(),
    distributors: z
        .object({
            name: text,
            userId: uuid.nullable().optional(),
            locationId: uuid,
            phone: shortOptional,
            address: optional,
            active: z.boolean().optional(),
        })
        .strict(),
    expenses: z
        .object({
            categoryId: uuid,
            description: text,
            amount: money.positive(),
            locationId: uuid,
            warehouseId: uuid.nullable().optional(),
            department: shortOptional,
            paymentMethod: z.enum(["bank_transfer", "cash", "card", "cheque"]),
            expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            reference: shortOptional,
            receiptUrl: z
                .string()
                .url()
                .max(255)
                .refine((v) => v.startsWith("https://"))
                .optional(),
        })
        .strict(),
};
const movement = z
    .object({
        type: z.enum([
            "incoming",
            "outgoing",
            "adjustment",
            "damaged",
            "returned",
            "distributor_allocation",
            "distributor_return",
        ]),
        productId: uuid,
        warehouseId: uuid,
        distributorId: uuid.nullable().optional(),
        quantity: decimal.positive(),
        cost: money.default(0),
        expectedVersion: z.number().int().nonnegative(),
        occurredAt: z.string().datetime(),
        operationId: uuid,
        reference: shortOptional,
        counterparty: shortOptional,
        delivery: optional,
        notes: optional,
        direction: z.enum(["add", "remove"]).optional(),
    })
    .strict();
const transfer = z
    .object({
        productId: uuid,
        sourceWarehouseId: uuid,
        destinationWarehouseId: uuid,
        quantity: decimal.positive(),
        notes: optional,
    })
    .strict()
    .refine(
        (v) => v.sourceWarehouseId !== v.destinationWarehouseId,
        "Choose two different warehouses.",
    );
    
module.exports = { schemas, movement, transfer, uuid, text, z };
