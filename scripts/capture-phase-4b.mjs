import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = "screenshots/phase-4b";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

async function snap(name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}

await page.goto(`${baseUrl}/chat`, { waitUntil: "load" });
await page.waitForTimeout(800);

const input = page.getByPlaceholder("Type a message…");
await input.fill("menu");
await input.press("Enter");
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Add to cart" }).first().click();
await page.waitForTimeout(600);
await page.getByRole("link", { name: /1 item/i }).click();
await page.waitForURL("**/cart");
await snap("01-cart");

await page.getByRole("link", { name: "Proceed to Checkout" }).click();
await page.waitForURL("**/checkout");
await page.fill("#name", "Rachel Fernandes");
await page.fill("#phone", "+91 98765 43210");
await page.fill("#address", "42 MG Road, Bengaluru, 560001");
await snap("02-checkout");

await page.getByRole("button", { name: "Continue to Payment" }).click();
await page.waitForURL("**/payment");
await page.fill("#transactionReference", "UPI9876543210");
await snap("03-payment");

await page.getByRole("button", { name: "Submit Payment" }).click();
await page.waitForURL("**/order-confirmation");
await snap("04-order-confirmation");

console.log(`Screenshots saved to ${outDir}/`);
await browser.close();
