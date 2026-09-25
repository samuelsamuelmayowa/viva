const pino = require('pino');
module.exports = pino({ redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token', 'res.headers.set-cookie', '*.password', '*.passwordHash', '*.token'] });
