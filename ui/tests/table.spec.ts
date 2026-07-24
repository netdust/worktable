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
