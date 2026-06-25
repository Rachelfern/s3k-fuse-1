import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  normalizeCommerceMessage,
  normalizeCommercePhrases,
} = require("../src/lib/hinglish.ts");
const { detectCommerceIntent, classifyCustomerIntent } = require("../src/lib/ai/message-intent.ts");
const { classifyChatIntentCategory } = require("../src/lib/ai/intent-categories.ts");
const { parseCartIntent } = require("../src/lib/ai/cart-parser.ts");
const { classifyConversationFlow } = require("../src/lib/chat/conversation-flows.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const catalog = [
  {
    id: "milk-1l",
    name_en: "Farm Fresh Milk 1L",
    name_hi: "दूध",
    price: 75,
    image_url: null,
    description: "Fresh dairy milk",
    category: "Dairy",
  },
];

const PHRASE_EXPECTATIONS = [
  ["add kardo cart mei", "add to cart", "CART_ADD"],
  ["cart mein daal do", "add to cart", "CART_ADD"],
  ["ek aur add karo", "add one more", "CART_ADD"],
  ["kitne ka hai", "how much does it cost", "PRODUCT_SEARCH"],
  ["dikhao", "show products", "PRODUCT_CATALOG"],
  ["mujhe chahiye", "i want to buy", "CART_ADD"],
  ["order kaha hai", "where is my order", "TRACK_ORDER"],
  ["return karna hai", "i want to return", "RETURN_REQUEST"],
  ["refund chahiye", "i want a refund", "REFUND_REQUEST"],
  ["aur ek doodh", "1 milk", "CART_ADD"],
];

for (const [input, expectedNormalized, expectedIntent] of PHRASE_EXPECTATIONS) {
  test(`normalizes "${input}" → "${expectedNormalized}"`, () => {
    const normalized = normalizeCommerceMessage(input);
    assert.equal(normalized, expectedNormalized);
  });

  test(`detects ${expectedIntent} for "${input}"`, () => {
    assert.equal(detectCommerceIntent(input), expectedIntent);
  });
}

test("normalizes cart mein spelling variant (me)", () => {
  assert.equal(normalizeCommercePhrases("tomato cart me daal do"), "add tomato to cart");
});

test("parses aur ek doodh into milk cart line", () => {
  const result = parseCartIntent("aur ek doodh", catalog);
  assert.equal(result.status, "ready");
  assert.match(result.lines[0].product.name_en, /Milk/i);
  assert.equal(result.lines[0].quantity, 1);
});

test("classifies order tracking category from Hinglish", () => {
  assert.equal(classifyChatIntentCategory("order kaha hai"), "order_tracking");
});

test("maps ek aur add karo to change quantity flow", () => {
  assert.equal(classifyConversationFlow("ek aur add karo")?.type, "CHANGE_QUANTITY");
});

test("mujhe doodh chahiye resolves product intent", () => {
  assert.equal(classifyCustomerIntent("mujhe doodh chahiye"), "CART_ADD");
  const result = parseCartIntent("mujhe doodh chahiye", catalog);
  assert.equal(result.status, "ready");
  assert.match(result.lines[0].product.name_en, /Milk/i);
});

console.log("\nAll Hinglish normalization checks passed.");
