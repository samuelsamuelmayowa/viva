const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const reference = prefix => `${prefix}-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
module.exports = { hash, token, reference };
