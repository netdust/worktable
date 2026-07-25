// a11y.spec.ts — the accessibility floor for every route the site ships.
//
// Deliberately axe-free: axe-core is excellent and you should add it,
// but it needs a network install and it reports ~90 rules of varying
// relevance. These are the handful that (a) fail on real WordPress
// themes constantly, (b) have zero false positives, and (c) are what an
// accessibility audit actually opens with. A gate you always run beats a
// gate you install later.
//
// Routes come from .flow/render-routes.txt so this file and wp-render.sh
// can never drift apart about what "the site" is.
import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = readFileSync(join(__dirname, "..", "render-routes.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

for (const route of ROUTES) {
  test.describe(`a11y ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
    });

    test("has exactly one h1", async ({ page }) => {
      // Zero means no page title in the a11y tree; several means the
      // document outline is a guess. Both break screen-reader nav.
      const count = await page.locator("h1").count();
      expect(count, `${route}: expected one <h1>, found ${count}`).toBe(1);
    });

    test("heading levels do not skip", async ({ page }) => {
      const levels = await page.$$eval("h1,h2,h3,h4,h5,h6", (hs) =>
        hs.map((h) => Number(h.tagName[1])),
      );
      let previous = 0;
      for (const level of levels) {
        if (previous !== 0) {
          expect(
            level - previous,
            `${route}: jumped from h${previous} to h${level}`,
          ).toBeLessThanOrEqual(1);
        }
        previous = level;
      }
    });

    test("every image carries alt text", async ({ page }) => {
      // alt="" is CORRECT for decorative images — the failure is a
      // missing attribute, which leaves a screen reader announcing the
      // filename.
      const missing = await page.$$eval("img:not([alt])", (imgs) =>
        imgs.map((i) => (i as HTMLImageElement).currentSrc || i.getAttribute("src") || "?"),
      );
      expect(missing, `${route}: <img> without alt`).toEqual([]);
    });

    test("every form control has an accessible name", async ({ page }) => {
      const unlabelled = await page.$$eval(
        "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea",
        (els) =>
          els
            .filter((el) => {
              const id = el.getAttribute("id");
              return !(
                el.getAttribute("aria-label") ||
                el.getAttribute("aria-labelledby") ||
                el.getAttribute("title") ||
                (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
                el.closest("label")
              );
            })
            .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(unlabelled, `${route}: form control with no label`).toEqual([]);
    });

    test("has a main landmark and a document language", async ({ page }) => {
      const lang = await page.getAttribute("html", "lang");
      expect(lang, `${route}: <html lang> is missing`).toBeTruthy();
      const main = await page.locator("main, [role=main]").count();
      expect(main, `${route}: expected one main landmark`).toBe(1);
    });

    test("links have discernible text", async ({ page }) => {
      const empty = await page.$$eval("a[href]", (as) =>
        as
          .filter((a) => {
            const text = (a.textContent || "").trim();
            const labelled =
              a.getAttribute("aria-label") || a.getAttribute("title");
            const img = a.querySelector("img[alt]:not([alt=''])");
            return !text && !labelled && !img;
          })
          .map((a) => a.getAttribute("href") || "?"),
      );
      expect(empty, `${route}: link with no accessible text`).toEqual([]);
    });

    test("no horizontal overflow at 360px", async ({ page }) => {
      // The cheapest possible responsive check, and the one that catches
      // a fixed-width element the desktop view never reveals.
      await page.setViewportSize({ width: 360, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `${route}: page scrolls horizontally at 360px`).toBe(false);
    });
  });
}
