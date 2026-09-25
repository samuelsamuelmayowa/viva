import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { preview } from "vite";
const require = createRequire(import.meta.url);
require("../api/node_modules/dotenv").config({ path: "../api/.env" });
require("../api/scripts/test-env");
const m = require("../api/models"),
    bcrypt = require("../api/node_modules/bcryptjs"),
    { Op } = require("../api/node_modules/sequelize");
const suffix = randomUUID().slice(0, 8),
    password = `Browser-Test-${randomUUID()}`;
let user, location, warehouse, product, browser, apiServer, webServer;
try {
    process.env.APP_ORIGIN = "http://localhost:8417";
    process.env.VIVA_API_URL = "http://127.0.0.1:8418";
    apiServer = await new Promise((resolve, reject) => {
        const server = require("../api/app").listen(8418, "127.0.0.1", () =>
            resolve(server),
        );
        server.on("error", reject);
    });
    webServer = await preview({
        preview: { host: "127.0.0.1", port: 8417, strictPort: true },
    });
    process.env.TEST_PWA = "true";
    location = await m.Location.create({
        name: `QA Lagos ${suffix}`,
        state: "Lagos",
        city: "Ikeja",
    });
    warehouse = await m.Warehouse.create({
        name: `QA Ikeja ${suffix}`,
        code: `QA-${suffix}`,
        locationId: location.id,
    });
    product = await m.Product.create({
        name: `QA Liquid Soap ${suffix}`,
        sku: `QA-${suffix}`,
        unit: "carton",
        costPrice: 2500,
        sellingPrice: 3200,
        minimumStock: 5,
    });
    user = await m.User.create({
        name: "QA Administrator",
        email: `qa-${suffix}@viva.invalid`,
        passwordHash: await bcrypt.hash(password, 12),
    });
    await user.addRole(await m.Role.findOne({ where: { name: "Admin" } }));
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1080 },
    }),
        page = await context.newPage(),
        errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", async (response) => {
        if (response.url().includes("/api/sync") && response.status() >= 400)
            console.log("Sync response:", response.status(), await response.text());
    });
    await page.goto("http://localhost:8417");
    await page.getByLabel("Work email").fill(user.email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in to Viva" }).click();
    await page.getByRole("heading", { name: "Operations overview" }).waitFor();
    if (process.env.TEST_PWA === "true") {
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload();
        await page.getByRole("heading", { name: "Operations overview" }).waitFor();
        assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    }
    await page.getByRole("link", { name: "Sync center", exact: true }).click();
    await page.getByRole("heading", { name: "Sync center" }).waitFor();
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "Record goods" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").nth(1).selectOption(warehouse.id);
    await dialog.locator("select").nth(2).selectOption(product.id);
    await dialog.getByLabel(/^Quantity/).fill("25");
    await dialog
        .getByRole("button", { name: "Record movement", exact: true })
        .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(product.name, { exact: true }).first().waitFor();
    await page.screenshot({ path: ".tmp/viva-dashboard.png", fullPage: true });
    await page.getByRole("button", { name: "Record goods" }).click();
    await dialog.locator("select").nth(1).selectOption(warehouse.id);
    await dialog.locator("select").nth(2).selectOption(product.id);
    await dialog.getByLabel(/^Quantity/).fill("5");
    await dialog.getByText(/Available: 25/).waitFor();
    await context.setOffline(true);
    await dialog
        .getByRole("button", { name: "Save offline", exact: true })
        .click();
    await dialog.waitFor({ state: "hidden" });
    await page
        .getByRole("link", { name: /Sync center/ })
        .first()
        .click();
    await page.getByRole("heading", { name: "Sync center" }).waitFor();
    await page.getByRole("cell", { name: "pending", exact: true }).waitFor();
    if (process.env.TEST_PWA === "true") {
        await page.reload();
        await page.getByRole("heading", { name: "Sync center" }).waitFor();
        await page.getByRole("cell", { name: "pending", exact: true }).waitFor();
    }
    await context.setOffline(false);
    await page.getByRole("button", { name: "Synchronize now" }).click();
    await expect(page.getByRole("cell", { name: /^synced$/i })).toHaveCount(2);
    const stock = await m.Inventory.findOne({
        where: { productId: product.id, warehouseId: warehouse.id },
    });
    assert.equal(Number(stock.quantity), 30);
    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor();
    await page.getByText(product.name, { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".tmp/viva-mobile.png", fullPage: true });
    const overflow = await page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
            .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
            .map((e) => ({
                tag: e.tagName,
                class: e.className,
                id: e.id,
                right: e.getBoundingClientRect().right,
                position: getComputedStyle(e).position,
                overflow: getComputedStyle(e).overflowX,
            }))
            .slice(-15),
    }));
    if (overflow.documentWidth > overflow.width)
        console.log("Overflow diagnostic:", JSON.stringify(overflow));
    assert.equal(
        overflow.documentWidth > overflow.width,
        false,
        "Mobile page overflows horizontally",
    );
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Approvals", exact: true }).click();
    await page.getByRole("heading", { name: "Approvals", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    const cookies = await context.cookies();
    assert.ok(cookies.find((c) => c.name === "viva_session")?.httpOnly);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    console.log(
        "Browser checks passed: sign-in, real goods receipt, offline queue, reconnect sync, inventory, mobile navigation, HttpOnly cookie, no localStorage auth.",
    );
} catch (error) {
    if (browser) {
        const page = browser.contexts()[0]?.pages()[0];
        if (page) {
            await page.screenshot({ path: ".tmp/viva-failure.png", fullPage: true });
            console.log((await page.locator("body").innerText()).slice(-5000));
        }
    }
    throw error;
} finally {
    await browser?.close();
    if (webServer)
        await new Promise((resolve) => webServer.httpServer.close(resolve));
    if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
    if (user) {
        const where = { userId: user.id };
        await m.Notification.destroy({ where });
        await m.Session.destroy({ where });
        await m.SyncOperation.destroy({ where });
        await m.SystemLog.destroy({ where });
        await m.Audit.destroy({ where });
        await m.Approval.destroy({ where: { requestedBy: user.id } });
        await m.Movement.destroy({ where });
        await m.UserRole.destroy({ where });
        await m.UserLocation.destroy({ where });
        await m.User.destroy({ where: { id: user.id }, force: true });
    }
    if (product) {
        await m.Inventory.destroy({ where: { productId: product.id } });
        await m.Product.destroy({ where: { id: product.id }, force: true });
    }
    if (warehouse)
        await m.Warehouse.destroy({ where: { id: warehouse.id }, force: true });
    if (location)
        await m.Location.destroy({ where: { id: location.id }, force: true });
    await m.sequelize.close();
}
