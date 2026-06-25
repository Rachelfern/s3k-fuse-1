import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = "screenshots/phase-4a";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

async function waitForChatReady() {
  await page.goto(`${baseUrl}/chat`, { waitUntil: "load" });
  await page.waitForSelector("header");
  await page.waitForTimeout(800);
}

async function sendMessage(text) {
  const input = page.getByPlaceholder("Type a message…");
  await input.fill(text);
  await input.press("Enter");
}

async function scrollChatToBottom() {
  await page.evaluate(() => {
    const container = document.querySelector(".overflow-y-auto");
    if (container) container.scrollTop = container.scrollHeight;
  });
  await page.waitForTimeout(300);
}

// 1. Empty cart
await waitForChatReady();
await page.screenshot({
  path: `${outDir}/01-empty-cart.png`,
  fullPage: true,
});

// 2. After Add to Cart (via menu + product card)
await sendMessage("menu");
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Add to cart" }).first().click();
await page.waitForTimeout(800);
await scrollChatToBottom();
await page.screenshot({
  path: `${outDir}/02-after-add-to-cart.png`,
  fullPage: true,
});

// 3. Cart summary via chat command
await sendMessage("my cart");
await page.waitForTimeout(1800);
await scrollChatToBottom();
await page.screenshot({
  path: `${outDir}/03-cart-summary-chat.png`,
  fullPage: true,
});

console.log(`Screenshots saved to ${outDir}/`);
await browser.close();
