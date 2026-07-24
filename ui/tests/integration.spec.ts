import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKEN } from "./fixture";

async function signIn(page: Page, view: string) {
  await page.clock.install({ time: new Date("2026-07-15T12:00:00Z") });
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto(`/?view=${view}`);
}

// A01 — one exhaustive ViewType→renderer map: each view type must
// render its OWN renderer root, proving the router dispatches distinctly.
const RENDERERS: [string, string][] = [
  ["dossiers", "table.records"],
  ["tasks-list", "table.records"], // `list` aliases the table renderer (grouped)
  ["tasks-board", ".kanban"],
  ["tasks-calendar", ".calendar"],
  ["tasks-timeline", ".tl-grid"],
];

for (const [view, root] of RENDERERS) {
  test(`A01 — ${view} renders the ${root} renderer`, async ({ page }) => {
    await signIn(page, view);
    await expect(page.locator(root)).toBeVisible();
  });
}

test("A01 — every view type is listed in the nav and switchable", async ({
  page,
}) => {
  await signIn(page, "dossiers");
  for (const [view] of RENDERERS) {
    // exact: view nav labels (lowercase) vs project heads (Capitalized)
    await expect(
      page.getByRole("button", { name: view, exact: true }),
    ).toBeVisible();
  }
  // switching the nav swaps the renderer without a reload
  await page.getByRole("button", { name: "tasks-board", exact: true }).click();
  await expect(page.locator(".kanban")).toBeVisible();
  await expect(page.locator("table.records")).toBeHidden();
});

test("A08 — runtime deps are exactly react, react-dom, @dnd-kit/core", async ({}) => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
  expect(Object.keys(pkg.dependencies).sort()).toEqual([
    "@dnd-kit/core",
    "react",
    "react-dom",
  ]);
});
