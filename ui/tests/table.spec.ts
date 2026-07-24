import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page, view = "dossiers") {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto(`/?view=${view}`);
}

test("A02 — table renders field-typed cells: status as a pill, a date as <time>", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.locator("table.records")).toBeVisible();
  const shipped = page.locator("tr.record-row", { hasText: "Shipped One" });
  // status column → the ported pill
  await expect(shipped.locator(".chip", { hasText: "final" })).toBeVisible();
  // updated column → a field-typed date cell (folio inference), not raw text
  await expect(shipped.locator("time.cell-date")).toHaveText("2026-07-25");
});

test("A02 — grouped table shows a group header with a count", async ({ page }) => {
  await signIn(page);
  const finalHeader = page.locator("tr.group-header", { hasText: "final" });
  await expect(finalHeader.locator(".group-label")).toHaveText("final");
  await expect(finalHeader.locator(".count")).toHaveText("1");
});

test("A02 — a mixed-status group renders the ported distribution bar", async ({
  page,
}) => {
  // the `list` view groups tasks by `area`; the build group holds
  // todo+doing+todo — >1 distinct status, so the distribution bar shows
  // its segments (single-status groups render it null).
  await signIn(page, "tasks-list");
  const build = page.locator("tr.group-header", { hasText: "build" });
  await expect(build.locator(".group-label")).toHaveText("build");
  await expect(build.locator(".count")).toHaveText("3");
  const bar = build.locator(".dist-bar");
  await expect(bar).toBeVisible();
  // two distinct statuses in the group → two segments (todo, doing)
  await expect(bar.locator(".dist-seg")).toHaveCount(2);
  // the single-status `ship` group has no bar
  const ship = page.locator("tr.group-header", { hasText: "ship" });
  await expect(ship.locator(".dist-bar")).toHaveCount(0);
});
