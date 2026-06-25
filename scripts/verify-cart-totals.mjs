import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

function parsePill(text) {
  const match = text.match(/(\d+)\s+items?\s·\s₹([\d,]+)/);
  if (!match) return null;
  return { itemCount: Number(match[1]), subtotal: Number(match[2].replace(/,/g, "")) };
}

function parseAssistant(text) {
  const countMatch = text.match(/Cart:\n(\d+)\s+items?/);
  const totalMatch = text.match(/₹([\d,]+)/);
  if (!countMatch || !totalMatch) return null;
  return {
    itemCount: Number(countMatch[1]),
    subtotal: Number(totalMatch[1].replace(/,/g, "")),
  };
}

async function getPillTotals() {
  const pillText = await page.getByRole("link", { name: /items · ₹/ }).innerText();
  return parsePill(pillText);
}

async function clickAddForProduct(name) {
  const card = page.locator("article").filter({ hasText: name });
  const addButton = card.getByRole("button", { name: "Add to cart" });
  if (await addButton.count()) {
    await addButton.click();
    return;
  }
  await card.getByRole("button", { name: new RegExp(`Increase ${name}`) }).click();
}

await page.goto(`${baseUrl}/chat`, { waitUntil: "load" });
await page.waitForTimeout(800);

const input = page.getByPlaceholder("Type a message…");
await input.fill("menu");
await input.press("Enter");
await page.waitForTimeout(1800);

const steps = [
  "Paneer Butter Masala",
  "Butter Naan",
  "Butter Naan",
];

for (const product of steps) {
  await clickAddForProduct(product);
  await page.waitForTimeout(400);

  const pill = await getPillTotals();
  const lastAssistant = page.locator('[class*="whatsapp-in"]').last();
  const assistantText = await lastAssistant.innerText();
  const assistant = parseAssistant(assistantText);

  console.log(`After ${product}:`);
  console.log(`  Pill:       ${pill ? `${pill.itemCount} items · ₹${pill.subtotal}` : "parse failed"}`);
  console.log(`  Assistant:  ${assistant ? `${assistant.itemCount} items · ₹${assistant.subtotal}` : "parse failed"}`);

  if (!pill || !assistant || pill.itemCount !== assistant.itemCount || pill.subtotal !== assistant.subtotal) {
    console.error("MISMATCH DETECTED");
    await browser.close();
    process.exit(1);
  }
}

console.log("All totals match.");
await browser.close();
