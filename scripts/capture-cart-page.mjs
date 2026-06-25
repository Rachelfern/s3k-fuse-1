import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = "screenshots/phase-4a";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${baseUrl}/chat`, { waitUntil: "load" });
await page.waitForSelector("header");
await page.waitForTimeout(800);

const input = page.getByPlaceholder("Type a message…");
await input.fill("menu");
await input.press("Enter");
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Add to cart" }).first().click();
await page.waitForTimeout(600);

await page.getByRole("link", { name: /1 item/i }).click();
await page.waitForURL("**/cart");
await page.waitForTimeout(800);
await page.screenshot({
  path: `${outDir}/04-cart-page-populated.png`,
  fullPage: true,
});

console.log(`Screenshot saved to ${outDir}/04-cart-page-populated.png`);
await browser.close();
