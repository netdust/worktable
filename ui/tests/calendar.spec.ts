import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page) {
  // Pin the wall clock so the calendar always opens on July 2026 (where
  // the fixture's `due` dates live), regardless of when the suite runs.
  await page.clock.install({ time: new Date("2026-07-15T12:00:00Z") });
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto("/?view=tasks-calendar");
}

test("A04 — records land on the day of their configured date field", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator(".calendar")).toBeVisible();
  await expect(page.locator(".cal-field")).toHaveText("by due");
  // the calendar opens on the current month (test clock is 2026-07);
  // alpha + delta are due 2026-07-08, beta 07-15, gamma 07-22. Match
  // the in-month cell whose day number is exactly 8 (not 18/28/filler).
  const cell08 = page
    .locator(".cal-cell:not(.out)", {
      has: page.locator(".cal-day", { hasText: /^8$/ }),
    })
    .first();
  await expect(
    cell08.locator(".cal-item-title", { hasText: "Alpha task" }),
  ).toBeVisible();
  await expect(
    cell08.locator(".cal-item-title", { hasText: "Delta task" }),
  ).toBeVisible();
  // clicking a calendar item opens its record
  await cell08.locator(".cal-item", { hasText: "Alpha task" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alpha task" })).toBeVisible();
});

test("A04 — month navigation moves the grid", async ({ page }) => {
  await signIn(page);
  const heading = page.locator(".cal-head h2");
  const first = await heading.innerText();
  await page.getByRole("button", { name: "next month" }).click();
  await expect(heading).not.toHaveText(first);
  await page.getByRole("button", { name: "previous month" }).click();
  await expect(heading).toHaveText(first);
});
