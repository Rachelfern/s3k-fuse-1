import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3015";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: "screenshots/home.png" });

await page.goto(`${baseUrl}/chat`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: "screenshots/chat.png", fullPage: true });

const audit = await page.evaluate(() => {
  const header = document.querySelector("header");
  const body = document.body;
  return {
    stylesheets: document.styleSheets.length,
    headerBg: header ? getComputedStyle(header).backgroundColor : null,
    bodyFont: getComputedStyle(body).fontFamily,
    hasWhatsappBg: !!document.querySelector(".whatsapp-pattern"),
  };
});

console.log(JSON.stringify(audit, null, 2));
await browser.close();
