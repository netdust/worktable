import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page, view = "dossiers") {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto(`/?view=${view}`);
}

test("T12 — rail groups views under their project (source folder)", async ({
  page,
}) => {
  await signIn(page);
  // two projects derived from the view sources: records/dossiers, records/tasks
  await expect(
    page.getByRole("button", { name: "Dossiers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tasks", exact: true }),
  ).toBeVisible();
  // the tasks views are nested under the Tasks project
  const tasksProject = page.locator(".rail-project", { hasText: "Tasks" });
  await expect(
    tasksProject.getByRole("button", { name: "tasks-board", exact: true }),
  ).toBeVisible();
  await expect(
    tasksProject.getByRole("button", { name: "tasks-calendar", exact: true }),
  ).toBeVisible();
  // the dossiers view is NOT under the Tasks project
  await expect(
    tasksProject.getByRole("button", { name: "dossiers", exact: true }),
  ).toHaveCount(0);
});

test("T12 — a project collapses and expands", async ({ page }) => {
  await signIn(page); // active view is dossiers, so Tasks is collapsible
  const board = page.getByRole("button", { name: "tasks-board", exact: true });
  await expect(board).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(board).toBeHidden(); // collapsed
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(board).toBeVisible(); // expanded again
});

test("T12 — the project holding the active view stays open", async ({ page }) => {
  await signIn(page, "tasks-board"); // active view lives under Tasks
  await expect(
    page.getByRole("button", { name: "tasks-board", exact: true }),
  ).toBeVisible();
});
