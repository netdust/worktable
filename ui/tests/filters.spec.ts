import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page, view: string) {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto(`/?view=${view}`);
}

test("T13 — adding a filter narrows the rows and persists in the URL", async ({
  page,
}) => {
  await signIn(page, "tasks-list");
  await expect(page.locator("table.records")).toBeVisible();
  await expect(page.locator("tr.record-row")).toHaveCount(4); // alpha/beta/gamma/delta

  // add a `status is todo` filter through the shared control bar
  await page.getByLabel("add filter").selectOption("status");
  await page.getByLabel("status value").fill("todo");
  // only the two todo tasks remain
  await expect(page.locator("tr.record-row")).toHaveCount(2);
  await expect(page.getByText("Alpha task")).toBeVisible();
  await expect(page.getByText("Delta task")).toBeVisible();
  await expect(page.getByText("Gamma task")).toHaveCount(0);

  // the filter is in the URL → a reload keeps it (ephemeral but shareable)
  expect(page.url()).toContain("filters=status%7Cis%7Ctodo");
  await page.reload();
  await expect(page.locator("tr.record-row")).toHaveCount(2);
});

test("T13 — the group control regroups the view live", async ({ page }) => {
  await signIn(page, "tasks-list"); // default groups by area (build/ship)
  await expect(
    page.locator("tr.group-header .group-label", { hasText: "build" }),
  ).toBeVisible();
  // override group → status
  await page.getByLabel("group by").selectOption("status");
  const labels = await page
    .locator("tr.group-header .group-label")
    .allInnerTexts();
  expect(labels.sort()).toEqual(["doing", "done", "todo"]);
});

test("T13 — the sort control reorders the rows live", async ({ page }) => {
  await signIn(page, "tasks-list");
  // drop grouping so the test is purely about row order
  await page.getByLabel("group by").selectOption("");
  // sort by title ascending
  await page.getByLabel("sort by").selectOption("title");
  // default dir is desc; toggle to asc
  await page.getByLabel("toggle sort direction").click();
  const titles = await page.locator(".row-title").allInnerTexts();
  expect(titles).toEqual([
    "Alpha task",
    "Beta task",
    "Delta task",
    "Gamma task",
  ]);
});

test("T13 — switching views clears the ephemeral filter", async ({ page }) => {
  await signIn(page, "tasks-list");
  await page.getByLabel("add filter").selectOption("status");
  await page.getByLabel("status value").fill("todo");
  await expect(page.locator("tr.record-row")).toHaveCount(2);
  // navigate to another view via the rail → controls reset
  await page.getByRole("button", { name: "tasks-board", exact: true }).click();
  await expect(page.locator(".kanban")).toBeVisible();
  expect(page.url()).not.toContain("filters=");
});
