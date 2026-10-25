import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const STORAGE_KEY = "io.trolley.desktop.workspace.v1";
const screenshotDir = process.env.TROLLEY_QA_SCREENSHOTS;
const server = await createServer({
  server: { host: "127.0.0.1", port: 1421, strictPort: true },
});
let browser;

function closeEnough(actual, expected, description) {
  assert.ok(Math.abs(actual - expected) <= 1,
    `${description}: expected ${expected}, got ${actual}`);
}

async function startDrag(page, card, grabTarget) {
  const box = await card.boundingBox();
  assert.ok(box, "The task must be visible before dragging.");
  const grabBox = grabTarget ? await grabTarget.boundingBox() : null;
  const start = grabBox
    ? { x: grabBox.x + grabBox.width / 2, y: grabBox.y + grabBox.height / 2 }
    : { x: box.x + 70, y: box.y + box.height - 8 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y);
  return { box, start };
}

async function assertTracking(page, overlay, drag, dx, dy) {
  await page.mouse.move(drag.start.x + dx, drag.start.y + dy);
  await overlay.waitFor({ state: "visible" });
  const floating = await overlay.boundingBox();
  assert.ok(floating, "A visible preview must follow the pointer.");
  closeEnough(floating.x, drag.box.x + dx, "Horizontal grab offset");
  closeEnough(floating.y, drag.box.y + dy, "Vertical grab offset");
  closeEnough(floating.width, drag.box.width, "Preview width");
  closeEnough(floating.height, drag.box.height, "Preview height");
  assert.equal(await overlay.evaluate((element) =>
    element.parentElement.parentElement === document.body), true);
}

async function cancelDrag(page, overlay) {
  await page.keyboard.press("Escape");
  // Releasing later must not outlive the sensor's click suppression.
  await page.waitForTimeout(80);
  await page.mouse.up();
  await overlay.waitFor({ state: "hidden" });
  await page.waitForTimeout(50);
}

async function saveScreenshot(page, name) {
  if (screenshotDir) {
    await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
  }
}

async function taskColumn(page, title) {
  return page.getByRole("button", { name: title, exact: true })
    .evaluate((button) => button.closest(".kanban-column")
      ?.querySelector("h2")?.textContent);
}

async function verifyCase(snapshot, options, name, url) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ snapshot, key }) => {
    localStorage.setItem(key, JSON.stringify(snapshot));
  }, { snapshot, key: STORAGE_KEY });
  await page.goto(url);
  await page.locator(".kanban-scroll").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const ready = page.getByRole("region", { name: "Ready column" });
  assert.match(await ready.locator(".column-header p").textContent(), /\/ 20$/);
  const title = "Opening morning";
  const card = page.getByRole("button", { name: title, exact: true })
    .locator("xpath=ancestor::article");
  const overlay = page.locator(".board-task-drag-overlay");
  const origin = await taskColumn(page, title);
  const drag = await startDrag(page, card);
  await assertTracking(page, overlay, drag, 40, 25);
  await assertTracking(page, overlay, drag, 70, -15);
  await saveScreenshot(page, `${name}-board-drag`);
  await cancelDrag(page, overlay);
  assert.equal(await taskColumn(page, title), origin);
  assert.equal(await page.getByRole("dialog").count(), 0,
    "Cancelling a body drag must not click through into task details");

  for (const grabTarget of [
    card.locator(".task-ticket-open"),
    card.locator(".priority-badge"),
    card.locator(".task-metadata"),
    card.locator(".drag-handle"),
  ]) {
    const pickup = await startDrag(page, card, grabTarget);
    try {
      await overlay.waitFor({ state: "visible", timeout: 3000 });
    } catch (cause) {
      await saveScreenshot(page, `${name}-pickup-failed`);
      const surface = await grabTarget.getAttribute("class");
      throw new Error(`${name}: failed pickup from ${surface}`, { cause });
    }
    await assertTracking(page, overlay, pickup, 30, 10);
    await cancelDrag(page, overlay);
    assert.equal(await taskColumn(page, title), origin);
    assert.equal(await page.locator(".priority-menu").count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0);
  }

  // A click still opens controls when the pointer has not crossed 6 px.
  await card.locator(".priority-badge").click();
  await page.getByRole("listbox").waitFor();
  await page.getByRole("option", { name: "Critical", exact: true }).click();
  await page.getByRole("listbox").waitFor({ state: "hidden" });
  assert.equal(await card.locator(".priority-badge").textContent(), "Critical");

  // This crossing re-parents the placeholder during pointer travel.
  await startDrag(page, card);
  const destination = page.getByRole("region", { name: "Ready column" });
  const target = await destination.boundingBox();
  await page.mouse.move(target.x + 90, target.y + 100, { steps: 12 });
  await page.mouse.up();
  await overlay.waitFor({ state: "hidden" });
  assert.equal(await taskColumn(page, title), "Ready");
  await page.waitForFunction(({ key, title }) => {
    const stored = JSON.parse(localStorage.getItem(key));
    const task = stored.tasks.find((item) => item.title === title);
    return stored.columns.find((column) => column.id === task.columnId)
      ?.name === "Ready";
  }, { key: STORAGE_KEY, title });

  const orderBefore = await destination.locator(".task-ticket-open")
    .allTextContents();
  const sourceIndex = orderBefore.indexOf(title);
  const otherTitle = sourceIndex === 0
    ? orderBefore[1] : orderBefore[0];
  const otherCard = destination.getByRole("button", {
    name: otherTitle, exact: true,
  }).locator("xpath=ancestor::article");
  const otherBox = await otherCard.boundingBox();
  await startDrag(page, card);
  await page.mouse.move(otherBox.x + 90, otherBox.y + otherBox.height / 2,
    { steps: 10 });
  await page.mouse.up();
  await overlay.waitFor({ state: "hidden" });
  const reordered = [...orderBefore];
  reordered.splice(sourceIndex, 1);
  reordered.splice(orderBefore.indexOf(otherTitle), 0, title);
  assert.deepEqual(await destination.locator(".task-ticket-open")
    .allTextContents(), reordered, "Same-column reorder follows the gap");

  // Keyboard pickup remains usable after the pointer move.
  const handle = page.getByRole("button", { name: `Move ${title}` });
  await handle.focus();
  await page.keyboard.press("Space");
  await overlay.waitFor({ state: "visible" });
  await page.waitForTimeout(50);
  await cancelDrag(page, overlay);

  await page.keyboard.press("3");
  await page.locator(".matrix-shell").waitFor();
  await page.waitForTimeout(250);
  const matrixCard = page.getByRole("button", { name: title, exact: true })
    .locator("xpath=ancestor::article");
  await matrixCard.scrollIntoViewIfNeeded();
  const matrixDrag = await startDrag(page, matrixCard);
  const matrixOverlay = page.locator(".matrix-task-drag-overlay");
  await assertTracking(page, matrixOverlay, matrixDrag, 35, 15);
  await saveScreenshot(page, `${name}-matrix-drag`);
  await cancelDrag(page, matrixOverlay);
  const matrixBadgeDrag = await startDrag(
    page, matrixCard, matrixCard.locator(".priority-badge"),
  );
  await assertTracking(page, matrixOverlay, matrixBadgeDrag, 30, 10);
  await cancelDrag(page, matrixOverlay);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.getByRole("listbox").count(), 0);

  await page.keyboard.press("4");
  await page.locator(".task-table").waitFor();
  await page.waitForTimeout(250);
  const rowHandle = page.getByRole("button", { name: `Move ${title}` });
  const row = rowHandle.locator("xpath=ancestor::tr");
  await row.scrollIntoViewIfNeeded();
  const rowBox = await row.boundingBox();
  const handleBox = await rowHandle.boundingBox();
  const rowStart = { x: handleBox.x + 8, y: handleBox.y + 8 };
  await page.mouse.move(rowStart.x, rowStart.y);
  await page.mouse.down();
  await page.mouse.move(rowStart.x + 8, rowStart.y);
  await page.mouse.move(rowStart.x + 30, rowStart.y + 20);
  const listOverlay = page.locator(".list-task-drag-overlay");
  await listOverlay.waitFor({ state: "visible" });
  const listBox = await listOverlay.boundingBox();
  closeEnough(listBox.x, rowBox.x + 30, "List horizontal grab offset");
  closeEnough(listBox.y, rowBox.y + 20, "List vertical grab offset");
  await cancelDrag(page, listOverlay);
  assert.deepEqual(errors, [], "No runtime errors during drag workflows");
  await context.close();
  console.log(`PASS ${name}: whole-card drag, controls, tracking, ` +
    "transfer, reorder, cancel, keyboard, Matrix, List");
}

try {
  await server.listen();
  const { createDemoWorkspace } = await server.ssrLoadModule(
    "/src/data/demo.ts",
  );
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const cases = [
    ["desktop-light", 1440, 900, "comfortable", "light", "no-preference"],
    ["desktop-compact", 1440, 900, "compact", "dark", "no-preference"],
    ["narrow-dark", 800, 650, "comfortable", "dark", "no-preference"],
    ["reduced-motion", 1440, 900, "comfortable", "light", "reduce"],
  ];
  for (const [name, width, height, density, theme, reducedMotion] of cases) {
    const snapshot = createDemoWorkspace(new Date("2026-09-04T12:00:00Z"));
    snapshot.preferences = {
      ...snapshot.preferences,
      density,
      theme,
      onboardingComplete: true,
      lastProjectId: snapshot.projects[0].id,
    };
    delete snapshot.preferences.columnTaskLimitMigrated;
    snapshot.columns.find((column) => column.name === "Ready").limit = 5;
    await verifyCase(snapshot, {
      viewport: { width, height }, reducedMotion,
    }, name, "http://127.0.0.1:1421");
  }
} finally {
  await browser?.close();
  await server.close();
}
