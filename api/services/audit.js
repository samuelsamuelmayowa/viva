const { Audit, Notification, User, Role } = require('../models');
const audit = (req, action, module, record, previousData, newData, transaction) => Audit.create({ userId: req.user?.id, action, module, recordId: record?.id, locationId: record?.locationId || null, previousData, newData, ip: req.ip, userAgent: req.get?.('user-agent')?.slice(0,512) }, { transaction });
const notify = (userId, title, message, href, transaction) => Notification.create({ userId, title, message, href }, { transaction });
const notifyAdmins = async (title, message, transaction) => {
 const users = await User.findAll({ include: [{ model: Role, where: { name: 'Admin' } }], transaction });
 await Promise.all(users.map(u => notify(u.id, title, message, '/approvals', transaction)));
};
module.exports = { audit, notify, notifyAdmins };
