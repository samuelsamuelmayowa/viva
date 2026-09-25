const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const auth = require("../controllers/auth");
const resources = require("../controllers/resources");
const insights = require("../controllers/insights");
const {
  authenticate,
  permit,
  scope,
  checkLocation,
  can,
} = require("../middleware/auth");
const { assert } = require("../utils/errors");
const { z, transfer } = require("../validators");
const { submitOperation } = require("../services/inventory");
const { createTransfer, transition } = require("../services/transfers");
const { requestChange, review } = require("../services/approvals");
const { Notification, SyncOperation, SystemLog } = require("../models");
const { Op } = require("sequelize");
const router = Router();
router.get("/health", (_req, res) =>
  res.json({ status: "up", service: "Viva API" }),
);
router.post(
  "/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  auth.login,
);
router.use(authenticate);
router.use('/finance', require('./finance'));
router.get("/auth/me", auth.session);
router.post("/auth/logout", auth.logout);
router.get("/dashboard", permit('dashboard.read'), insights.dashboard);
router.get("/inventory", permit("inventory.read"), resources.inventory);
router.post(
  "/inventory/movements",
  permit("inventory.write"),
  async (req, res) =>
    res.status(201).json(await submitOperation(req, req.body)),
);
router.post("/incoming", permit("inventory.write"), async (req, res) => {
  assert(req.body.type === "incoming", 422, "Incoming type required.");
  res.status(201).json(await submitOperation(req, req.body));
});
router.post("/outgoing", permit("inventory.write"), async (req, res) => {
  assert(req.body.type === "outgoing", 422, "Outgoing type required.");
  res.status(201).json(await submitOperation(req, req.body));
});
router.post("/transfers", permit("inventory.write"), async (req, res) =>
  res.status(201).json(await createTransfer(req, transfer.parse(req.body))),
);
router.post("/transfers/:id/action", async (req, res) => {
  const { action } = z
    .object({
      action: z.enum(["approve", "reject", "release", "receive", "cancel"]),
    })
    .strict()
    .parse(req.body);
  res.json(await transition(req, req.params.id, action));
});
router.post(
  "/approvals/:id/review",
  permit("approvals.review"),
  async (req, res) => {
    const data = z
      .object({
        decision: z.enum(["approved", "rejected"]),
        comments: z.string().trim().min(3).max(2000),
      })
      .strict()
      .parse(req.body);
    res.json(await review(req, req.params.id, data.decision, data.comments));
  },
);
router.get("/distribution", permit("distribution.read"), insights.distribution);
router.get("/system-health", permit("system.read"), insights.health);
router.post("/system-health/events", async (req, res) => {
  const data = z
    .object({
      code: z.enum(["SYNC_FAILED", "QUEUE_FAILED", "API_FAILED"]),
      message: z.string().max(255),
    })
    .strict()
    .parse(req.body);
  await SystemLog.create({ ...data, level: "warning", userId: req.user.id });
  res.status(201).json({ ok: true });
});
router.post(
  "/system-health/:id/resolve",
  permit("system.read"),
  async (req, res) => {
    await SystemLog.update(
      { resolvedAt: new Date() },
      { where: { id: req.params.id } },
    );
    res.json({ ok: true });
  },
);
router.get("/notifications", async (req, res) =>
  res.json({
    data: await Notification.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 50,
    }),
  }),
);
router.post("/notifications/:id/read", async (req, res) => {
  await Notification.update(
    { readAt: new Date() },
    { where: { id: req.params.id, userId: req.user.id } },
  );
  res.json({ ok: true });
});
router.get("/sync", async (req, res) =>
  res.json({
    data: await SyncOperation.findAll({
      where: can(req.user, "approvals.review")
        ? scope(req.user)
        : { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 200,
    }),
  }),
);
router.post("/sync", permit("inventory.write"), async (req, res) => {
  assert(req.get('x-viva-user') === req.user.id,403,'Sign in to the account that recorded this operation.','SYNC_ACCOUNT_MISMATCH');
  res.json(await submitOperation(req, req.body));
});
router.post(
  "/sync/:id/resolve",
  permit("approvals.review"),
  async (req, res) => {
    const { reason } = z
      .object({ reason: z.string().trim().min(5).max(1000) })
      .strict()
      .parse(req.body);
    const { sequelize } = require("../models");
    await sequelize.transaction(async (transaction) => {
      const op = await SyncOperation.findByPk(req.params.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      assert(op, 404, "Operation not found.");
      if (op.locationId) checkLocation(req.user, op.locationId);
      assert(
        op.status === "conflict",
        409,
        "Operation is not an unresolved conflict.",
      );
      await op.update({ status: "reviewed", error: reason }, { transaction });
      await require("../services/audit").audit(
        req,
        "conflict_review",
        "sync",
        op,
        null,
        { reason },
        transaction,
      );
    });
    res.json({ ok: true });
  },
);
router.get("/reports/:type", permit("reports.read"), insights.report);
router.post("/users", permit("users.manage"), resources.createUser);
router.patch("/users/:id", permit("users.manage"), resources.updateUser);
router.post("/roles", permit("users.manage"), resources.createRole);
const read = {
  locations: "locations.read",
  warehouses: "locations.read",
  products: "products.read",
  distributors: "distributors.read",
  expenses: "finance.read",
  incoming: "inventory.read",
  outgoing: "inventory.read",
  movements: "inventory.read",
  transfers: "inventory.read",
  approvals: "approvals.read",
  audit: "audit.read",
  "product-categories": "products.read",
  "expense-categories": "finance.read",
  users: "users.manage",
  roles: "users.manage",
  permissions: "users.manage",
};
const write = {
  locations: "locations.manage",
  warehouses: "locations.manage",
  products: "products.manage",
  distributors: "distributors.manage",
  expenses: "expenses.write",
  "product-categories": "products.manage",
  "expense-categories": "expenses.write",
};
for (const [module, permission] of Object.entries(read))
  router.get(
    `/${module}`,
    (req, res, next) => {
      req.params.module = module;
      next();
    },
    permit(permission),
    resources.list,
  );
for (const [module, permission] of Object.entries(write)) {
  router.post(
    `/${module}`,
    (req, res, next) => {
      req.params.module = module;
      next();
    },
    permit(permission),
    resources.create,
  );
  if (!module.endsWith("categories"))
    router.post(
      `/${module}/:id/corrections`,
      permit(permission),
      async (req, res) =>
        res
          .status(201)
          .json(await requestChange(req, module, req.params.id, req.body)),
    );
}
module.exports = router;
router.get('/transfer-destinations',permit('inventory.write'),async(req,res)=>{const {Warehouse}=require('../models');const data=await Warehouse.findAll({where:{active:true},attributes:['id','name','code','locationId'],limit:200,order:[['name','ASC']]});res.json({data,total:data.length});});
for(const name of ['incoming','outgoing','movements'])router.post(`/${name}/:id/corrections`,permit('inventory.write'),async(req,res)=>res.status(201).json(await requestChange(req,'movements',req.params.id,req.body)));
router.use('/distribution',require('./distribution'));
router.get('/stock-counts',permit('inventory.read'),async(req,res)=>{const data=await require('../models/stock').StockCount.findAll({where:scope(req.user),order:[['createdAt','DESC']],limit:200});res.json({data,total:data.length});});
router.get('/reservations',permit('inventory.read'),async(req,res)=>{const data=await require('../models/stock').Reservation.findAll({where:scope(req.user),order:[['createdAt','DESC']],limit:200});res.json({data,total:data.length});});
router.post('/stock-counts',permit('inventory.write'),async(req,res)=>res.status(201).json(await require('../services/stockOperations').count(req)));
router.post('/reservations',permit('inventory.write'),async(req,res)=>res.status(201).json(await require('../services/stockOperations').reserve(req)));
router.post('/reservations/:id/release',permit('inventory.write'),async(req,res)=>res.json(await require('../services/stockOperations').release(req,req.params.id)));
