require('./test-env');
process.env.PORT='8001';
process.env.APP_ORIGIN='http://localhost:4173';
require('../server');
