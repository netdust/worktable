import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page) {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto("/?view=tasks-timeline");
}

test("A05 — records render as bars, one lane each", async ({ page }) => {
  await signIn(page);
  await expect(page.locator(".tl-grid")).toBeVisible();
  // all four records (alpha/beta/gamma ranges + delta single-date) get a
  // lane. Lane ORDER follows the view's sort (`start asc`, delta has no
  // start so it sorts first); assert the set, not the order.
  const labels = await page.locator(".tl-lane-label").allInnerTexts();
  expect(labels.sort()).toEqual([
    "Alpha task",
    "Beta task",
    "Delta task",
    "Gamma task",
  ]);
  await expect(page.locator(".tl-bar")).toHaveCount(4);
});

test("A05 — a bar spans multiple columns for a start/end range", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator(".tl-grid")).toBeVisible();
  // alpha spans 07-06..07-10; at week zoom that is one week column, but
  // switching to day zoom makes it span several day columns. Assert the
  // bar's grid-column span grows when zooming in.
  const alphaBar = page.locator(".tl-bar", { hasText: "Alpha task" });
  await page.getByRole("button", { name: "day" }).click();
  const span = await alphaBar.evaluate((el) => {
    const gc = getComputedStyle(el).gridColumn; // "1 / span N"
    const m = gc.match(/span (\d+)/);
    return m ? Number(m[1]) : 1;
  });
  expect(span).toBeGreaterThan(1); // 07-06..07-10 is 5 day-columns
});

test("A05 — zoom switches day/week/month", async ({ page }) => {
  await signIn(page);
  const scaleCols = page.locator(".tl-col-head");
  await page.getByRole("button", { name: "month" }).click();
  const monthCount = await scaleCols.count();
  await page.getByRole("button", { name: "day" }).click();
  const dayCount = await scaleCols.count();
  // the same date range yields far more day columns than month columns
  expect(dayCount).toBeGreaterThan(monthCount);
});
