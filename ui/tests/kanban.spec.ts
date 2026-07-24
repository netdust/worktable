import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page) {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto("/?view=tasks-board");
}

test("A03 — kanban lays cards in the column of their group_by value", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator(".kanban")).toBeVisible();
  // lanes declared [todo, doing, done]; cards land under their status.
  const cols = page.locator(".kan-col");
  await expect(cols).toHaveCount(3);
  // alpha + delta are todo, beta doing, gamma done.
  const todo = cols.nth(0);
  await expect(todo.locator(".kan-card-title")).toHaveText([
    "Alpha task",
    "Delta task",
  ]);
  await expect(cols.nth(1).locator(".kan-card-title")).toHaveText(["Beta task"]);
  await expect(cols.nth(2).locator(".kan-card-title")).toHaveText(["Gamma task"]);
});

test("A03/R08 — dragging a flow-owned card opens its seal, never writes", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator(".kanban")).toBeVisible();
  // beta is parked at a human node (awaiting_seal). Dragging its card
  // from `doing` to `done` must open the record (to seal), not silently
  // change status. Drive a real pointer drag past dnd-kit's 4px
  // activation threshold, in steps, onto the done column.
  const card = page.locator(".kan-card", { hasText: "Beta task" });
  const done = page.locator(".kan-col").nth(2);
  const from = await card.boundingBox();
  const to = await done.boundingBox();
  if (!from || !to) throw new Error("missing geometry");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, {
    steps: 5,
  });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  // the record panel opened at beta — the seal is where status changes,
  // not the board
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beta task" })).toBeVisible();
});

test("A03/R08 — dragging a non-awaiting flow-owned card notes, never writes", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator(".kanban")).toBeVisible();
  // gamma is `done` and NOT awaiting a seal. Dragging it to `todo` must
  // surface the flow-owned NOTE (no silent status write). This signal is
  // drag-distinct: a plain card click opens the panel, it never shows a
  // note — so this proves the drag path ran decideCardDrop, not onClick.
  const card = page.locator(".kan-card", { hasText: "Gamma task" });
  const todo = page.locator(".kan-col").nth(0);
  const from = await card.boundingBox();
  const to = await todo.boundingBox();
  if (!from || !to) throw new Error("missing geometry");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, {
    steps: 5,
  });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".kanban-note")).toContainText("sealed decision");
  // and no panel opened — a note is not an open
  await expect(page.getByRole("dialog")).toBeHidden();
});
