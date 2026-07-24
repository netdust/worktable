import { test, expect, type Page } from "@playwright/test";
import { TOKEN } from "./fixture";

async function signIn(page: Page) {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), TOKEN);
  await page.goto("/?view=dossiers&record=dossiers/demo");
}

test("A06 — panel is the slideover: folder-as-one, cover + flow-ordered tabs", async ({
  page,
}) => {
  await signIn(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // header + reviews badge + cover + artifact tabs in flow order
  await expect(dialog.getByRole("heading", { name: "Demo Dossier" })).toBeVisible();
  await expect(dialog.locator(".reviews-badge")).toContainText("1 review");
  const tabs = await dialog.locator(".tabs .tab").allInnerTexts();
  expect(tabs).toEqual(["Cover", "research.md", "dossier.md"]);
});

test("A06 — no editor / relations / comments chrome is present", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  // folio's detail bloat stays excluded — artifacts render as inert text
  expect(await page.locator("[contenteditable=true]").count()).toBe(0);
  expect(await page.locator(".milkdown, .ProseMirror, .cm-editor").count()).toBe(0);
  expect(await page.locator(".relations, .comments, .wikilink").count()).toBe(0);
});

test("A06 — Escape closes the panel", async ({ page }) => {
  await signIn(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
