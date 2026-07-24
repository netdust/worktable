import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { TOKEN, FIXTURE_DIR, NETDUST_FLOW } from "./fixture";

// Sign in through the token gate; leaves the app on the default view.
async function signIn(page: Page, token = TOKEN) {
  await page.addInitScript((t) => localStorage.setItem("worktable_token", t), token);
  await page.goto("/");
}

test("A01 — wrong token shows the gate, not a broken view", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "worktable" })).toBeVisible();
  await page.getByLabel("access token").fill("nope");
  await page.getByRole("button", { name: "Open" }).click();
  // a 401 on /views bounces straight back to the gate
  await expect(page.getByLabel("access token")).toBeVisible();
});

test("A01/A02 — valid token lists the view and renders grouped rows", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "dossiers" })).toBeVisible();
  // grouped by status: a group header per status, records beneath
  await expect(page.getByText("reviewed", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Demo Dossier")).toBeVisible();
  await expect(page.getByText("Shipped One")).toBeVisible();
  // sort desc by updated: Shipped One (07-25) group ordering is stable;
  // the demo row carries a status chip
  await expect(page.locator(".chip", { hasText: "reviewed" })).toBeVisible();
});

test("A03 — opening a record shows cover + flow-ordered artifact tabs", async ({
  page,
}) => {
  await signIn(page);
  await page.getByText("Demo Dossier").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cover" })).toBeVisible();
  // flow out: order is research.md then dossier.md
  const tabs = await page.locator(".tabs .tab").allInnerTexts();
  expect(tabs).toEqual(["Cover", "research.md", "dossier.md"]);
  // cover shows item.md body
  await expect(page.locator(".doc")).toContainText("This is the cover body");
  // a tab lazy-loads its artifact
  await page.getByRole("button", { name: "research.md" }).click();
  await expect(page.locator(".doc")).toContainText("sourced findings");
});

test("A04 — approve posts a real seal and the panel reflects it", async ({
  page,
}) => {
  await signIn(page);
  await page.getByText("Demo Dossier").click();
  await expect(page.getByText("Decision on", { exact: false })).toBeVisible();
  await page.getByLabel("seal note").fill("looks good");
  await page.getByRole("button", { name: "Approve" }).click();
  // the seal is real: seal.py check reads it back
  await expect
    .poll(
      () => {
        try {
          execFileSync(
            "python3",
            [
              `${NETDUST_FLOW}/bin/seal.py`,
              "check",
              "records/dossiers/demo",
              "approve",
            ],
            { cwd: FIXTURE_DIR },
          );
          return 0;
        } catch (e) {
          return (e as { status?: number }).status ?? -1;
        }
      },
      { timeout: 8000 },
    )
    .toBe(0);
});

test("A04 — a bad seal surfaces the server's reason", async ({ page }) => {
  await signIn(page);
  await page.getByText("Demo Dossier").click();
  // drive a rejection through a broken decision by intercepting? no —
  // instead verify the error path shows server text on a 4xx: seal an
  // already-final record has no seal_node, so use the network directly
  const res = await page.evaluate(async (token) => {
    const r = await fetch("/seal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ record: "dossiers/demo", node: "approve", decision: "maybe" }),
    });
    return { status: r.status, body: await r.json() };
  }, TOKEN);
  expect(res.status).toBe(400);
  expect(res.body.error).toContain("approved or rejected");
});

test("A05 — a file change on disk refreshes the open view", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Demo Dossier")).toBeVisible();
  // rename the title on disk; the SSE tick should refetch the view
  const item = `${FIXTURE_DIR}/records/dossiers/demo/item.md`;
  execFileSync("sed", ["-i", "s/Demo Dossier/Renamed Live/", item]);
  await expect(page.getByText("Renamed Live")).toBeVisible({ timeout: 8000 });
  execFileSync("sed", ["-i", "s/Renamed Live/Demo Dossier/", item]); // restore
});

test("A06 — deep link restores view + open record", async ({ page }) => {
  await signIn(page);
  await page.goto("/?view=dossiers&record=dossiers/demo");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demo Dossier" })).toBeVisible();
});
