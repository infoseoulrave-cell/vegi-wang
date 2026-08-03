/**
 * Capture 3 screenshots for grant applications.
 * Usage: node scripts/capture-application-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("docs/applications/screenshots");
const BASE = process.env.VEGI_URL || "https://vegi-wang.vercel.app";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});

async function shot(name, url, fullPage = true) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage, type: "jpeg", quality: 82 });
  console.log("saved", file);
}

await shot("01-home.jpg", `${BASE}/`);
await shot("02-home-viewport.jpg", `${BASE}/`, false);

// Try first item link if present
const href = await page
  .locator('a[href*="/items/"]')
  .first()
  .getAttribute("href")
  .catch(() => null);
if (href) {
  const itemUrl = href.startsWith("http") ? href : `${BASE}${href}`;
  await shot("03-item-detail.jpg", itemUrl, false);
} else {
  await shot("03-home-scroll.jpg", `${BASE}/`, true);
}

await browser.close();
console.log("done");
