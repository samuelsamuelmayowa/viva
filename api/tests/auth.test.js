const test = require("node:test");
const assert = require("node:assert/strict");
const { hash } = require("../utils/crypto");

// Isolate authentication from the real database and its credentials.
const modelsPath = require.resolve("../models");
const previousModels = require.cache[modelsPath];
let findSession;
require.cache[modelsPath] = {
  id: modelsPath,
  filename: modelsPath,
  loaded: true,
  exports: { Session: { findOne: (...args) => findSession(...args) } },
};
const { authenticate } = require("../middleware/auth");
if (previousModels) require.cache[modelsPath] = previousModels;
else delete require.cache[modelsPath];

test("missing session cookies return 401 without accessing the database", async () => {
  let queries = 0;
  findSession = async () => { queries += 1; throw new Error("Database unavailable"); };
  for (const cookies of [undefined, {}, { viva_session: "" }]) {
    let error;
    await authenticate({ cookies }, {}, (value) => { error = value; });
    assert.equal(error.status, 401);
    assert.equal(error.code, "UNAUTHENTICATED");
  }
  assert.equal(queries, 0);
});

test("unknown session cookies are checked by hash and return 401", async () => {
  findSession = async ({ where }) => {
    assert.equal(where.tokenHash, hash("unknown-session"));
    return null;
  };
  let error;
  await authenticate({ cookies: { viva_session: "unknown-session" } }, {}, (value) => { error = value; });
  assert.equal(error.status, 401);
  assert.equal(error.code, "UNAUTHENTICATED");
});

test("database errors for supplied sessions remain visible to the error handler", async () => {
  const failure = new Error("Database unavailable");
  findSession = async () => { throw failure; };
  let error;
  await authenticate({ cookies: { viva_session: "existing-session" } }, {}, (value) => { error = value; });
  assert.equal(error, failure);
});
