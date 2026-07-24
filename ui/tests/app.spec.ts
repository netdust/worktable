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

test("A01/A02 — valid token lists the view, grouped and ordered per definition", async ({
  page,
}) => {
  await signIn(page);
  // exact: the view nav button "dossiers" vs the project head "Dossiers"
  await expect(
    page.getByRole("button", { name: "dossiers", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Demo Dossier")).toBeVisible();
  await expect(page.getByText("Shipped One")).toBeVisible();
  await expect(page.locator(".chip", { hasText: "reviewed" })).toBeVisible();

  // A02 is about ORDER, not mere presence. The view is
  // `group_by: status, sort: updated desc`. shipped (updated 07-25,
  // final) sorts before demo (07-24, reviewed), so the `final` group
  // header must appear before the `reviewed` one, and each record sits
  // under its own group header. Read the DOM order via the structural
  // hooks (.group-label for headers, .row-title for records) so the
  // assertion survives the folio header layout (FIELD · value · N items).
  const order = await page
    .locator("table.records tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => {
        const g = tr.querySelector(".group-label");
        if (g) return `group:${g.textContent?.trim()}`;
        const t = tr.querySelector(".row-title");
        return `row:${t?.textContent?.trim() ?? ""}`;
      }),
    );
  const finalGroup = order.indexOf("group:final");
  const reviewedGroup = order.indexOf("group:reviewed");
  const shippedRow = order.indexOf("row:Shipped One");
  const demoRow = order.indexOf("row:Demo Dossier");
  expect(finalGroup).toBeGreaterThanOrEqual(0);
  expect(finalGroup).toBeLessThan(reviewedGroup); // updated desc order
  expect(finalGroup).toBeLessThan(shippedRow); // record under its header
  expect(reviewedGroup).toBeLessThan(demoRow);
  // columns follow the definition: [status, updated] after the record
  // (compare lowercased — CSS uppercases the header text for display)
  const headers = await page.locator("table.records thead th").allInnerTexts();
  expect(headers.map((h) => h.toLowerCase())).toEqual([
    "record",
    "status",
    "updated",
  ]);
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
  // the seal is real: seal.py check reads it back under the seal name
  // the flow uses (dossier — what gate-seal checks), which is exactly
  // the node the UI posts from awaiting_seal
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
              "dossier",
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

test("A04 — a server rejection surfaces through the SealBar UI", async ({
  page,
}) => {
  await signIn(page);
  await page.getByText("Demo Dossier").click();
  await expect(page.getByText("Decision on", { exact: false })).toBeVisible();
  // Force the server to reject THIS record's seal: intercept the POST
  // and return a 400, so the SealBar's own error path renders the
  // server reason (not a raw fetch bypassing the component).
  await page.route("**/seal", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "decision must be approved or rejected" }),
    }),
  );
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.locator(".seal-bar .pane-msg.error"),
  ).toContainText("approved or rejected");
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

test("panel closes on Escape and shows the reviews badge", async ({ page }) => {
  await signIn(page);
  await page.goto("/?view=dossiers&record=dossiers/demo");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".reviews-badge")).toContainText("1 review");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
