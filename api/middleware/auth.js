const { Op } = require("sequelize");
const { Session, User, Role, Permission, Location } = require("../models");
const { hash } = require("../utils/crypto");
const { assert } = require("../utils/errors");
async function authenticate(req, res, next) {
  try {
    const sessionToken = req.cookies?.viva_session;
    assert(sessionToken, 401, "Sign in to continue.", "UNAUTHENTICATED");
    const session = await Session.findOne({
      where: {
        tokenHash: hash(sessionToken),
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    assert(session, 401, "Sign in to continue.", "UNAUTHENTICATED");
    const user = await User.findByPk(session.userId, {
      include: [{ model: Role, include: [Permission] }, Location],
    });
    assert(
      user?.active,
      401,
      "This account is unavailable.",
      "UNAUTHENTICATED",
    );
    req.session = session;
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles.map((r) => r.name),
      permissions: [
        ...new Set(user.roles.flatMap((r) => r.permissions.map((p) => p.key))),
      ],
      organizationWide: user.roles.some((r) => r.organizationWide),
      locationIds: user.locations.map((l) => l.id),
      locations: user.locations.map((l) => ({ id: l.id, name: l.name })),
    };
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
      assert(
        hash(req.get("x-csrf-token") || "") === session.csrfHash,
        403,
        "Refresh your session and try again.",
        "CSRF_INVALID",
      );
    next();
  } catch (error) {
    next(error);
  }
}
const can = (user, permission) => user.permissions.includes(permission);
const permit = (permission) => (req, res, next) => {
  try {
    if (['users.manage','system.read'].includes(permission)) assert(req.user.organizationWide,403,'Organization-wide access is required for administration.');
    assert(
      can(req.user, permission),
      403,
      "You do not have permission for this action.",
    );
    next();
  } catch (e) {
    next(e);
  }
};
const checkLocation = (user, locationId) =>
  assert(
    user.organizationWide || user.locationIds.includes(locationId),
    403,
    "This location is not assigned to you.",
  );
const scope = (user) =>
  user.organizationWide ? {} : { locationId: { [Op.in]: user.locationIds } };
module.exports = { authenticate, can, permit, checkLocation, scope };
