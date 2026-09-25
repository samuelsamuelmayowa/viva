const bcrypt = require("bcryptjs");
const { User, Session, sequelize, SystemLog } = require("../models");
const { token, hash } = require("../utils/crypto");
const { z } = require("../validators");
const { audit } = require("../services/audit");

const isProduction = process.env.NODE_ENV === "production";

const cookie = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
};

const dummyHash = bcrypt.hashSync("no-account-timing-padding", 12);
async function login(req, res) {
    const data = z
        .object({
            email: z.string().email().max(255),
            password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
    const user = await User.findOne({
        where: { email: data.email.toLowerCase(), active: true },
    });
    const valid = await bcrypt.compare(
        data.password,
        user?.passwordHash || dummyHash,
    );
    if (!user || !valid) {
        await SystemLog.create({
            level: "warning",
            code: "LOGIN_FAILED",
            message: "An unsuccessful login attempt was recorded.",
        });
        throw Object.assign(new Error("Email or password is incorrect."), {
            status: 401,
            code: "INVALID_CREDENTIALS",
        });
    }
    const sessionToken = token(),
        csrfToken = hash(`viva-csrf:${sessionToken}`);
    await sequelize.transaction(async (transaction) => {
        if (req.cookies.viva_session)
            await Session.destroy({
                where: { tokenHash: hash(req.cookies.viva_session) },
                transaction,
            });
        await Session.create(
            {
                userId: user.id,
                tokenHash: hash(sessionToken),
                csrfHash: hash(csrfToken),
                expiresAt: new Date(Date.now() + cookie.maxAge),
            },
            { transaction },
        );
        await audit(
            { user: { id: user.id }, ip: req.ip, get: req.get.bind(req) },
            "login",
            "auth",
            user,
            null,
            null,
            transaction,
        );
    });
    res.cookie("viva_session", sessionToken, cookie).json({ csrfToken });
}
async function session(req, res) {
    const csrfToken = hash(`viva-csrf:${req.cookies.viva_session}`);
    if(req.session.csrfHash!==hash(csrfToken))await req.session.update({ csrfHash: hash(csrfToken) });
    res.json({ user: req.user, csrfToken, expiresAt: req.session.expiresAt });
}
async function logout(req, res) {
    await sequelize.transaction(async (transaction) => {
        await audit(req, "logout", "auth", null, null, null, transaction);
        await req.session.destroy({ transaction });
    });
    res
        .clearCookie("viva_session", { ...cookie, maxAge: undefined })
        .status(204)
        .end();
}
module.exports = { login, session, logout };
