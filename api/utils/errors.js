class AppError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') { super(message); this.status = status; this.code = code; }
}
const assert = (condition, status, message, code) => { if (!condition) throw new AppError(status, message, code); };
module.exports = { AppError, assert };
