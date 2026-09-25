const Decimal = require('decimal.js');
const { assert } = require('../utils/errors');
function stockChange(stock, type, quantity, direction) {
 const q = new Decimal(stock.quantity), r = new Decimal(stock.reserved), d = new Decimal(stock.damaged), amount = new Decimal(quantity);
 assert(amount.isPositive(), 422, 'Quantity must be positive.');
 const outgoing = ['outgoing','distributor_allocation','transfer_release','damaged'].includes(type) || (type === 'adjustment' && direction === 'remove');
 assert(!outgoing || q.minus(r).gte(amount), 409, 'Available stock has changed or is insufficient.', 'STOCK_CONFLICT');
 return { quantity: (outgoing ? q.minus(amount) : q.plus(amount)).toFixed(3), damaged: (type === 'damaged' ? d.plus(amount) : d).toFixed(3), version: stock.version + 1 };
}
module.exports = { stockChange };
