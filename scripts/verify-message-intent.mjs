import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  detectCommerceIntent,
  isProductCatalogRequest,
} = require("../src/lib/ai/message-intent.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const CATALOG_PHRASES = [
  "products",
  "show products",
  "browse products",
  "view products",
  "i want to view products",
  "i want to see products",
  "what products do you have",
  "show your catalog",
  "catalog",
  "show inventory",
  "what do u sell",
  "what do you sell",
  "what items do you have",
  "i want to view the products u have",
  "view catalog",
];

for (const phrase of CATALOG_PHRASES) {
  test(`detects PRODUCT_CATALOG for "${phrase}"`, () => {
    assert.equal(detectCommerceIntent(phrase), "PRODUCT_CATALOG");
    assert.equal(isProductCatalogRequest(phrase), true);
  });
}

test("does not classify specific product search as catalog", () => {
  assert.notEqual(detectCommerceIntent("show me protein powders"), "PRODUCT_CATALOG");
});

test("does not classify cart view as catalog", () => {
  assert.equal(detectCommerceIntent("view cart"), "CART_VIEW");
});

test("does not classify best sellers as catalog", () => {
  assert.equal(detectCommerceIntent("best sellers"), "PRODUCT_SEARCH");
});

const PRODUCT_SEARCH_PHRASES = [
  "Do you have wireless headphones?",
  "Show today's offers",
  "Show me protein powders",
];

for (const phrase of PRODUCT_SEARCH_PHRASES) {
  test(`detects PRODUCT_SEARCH for "${phrase}"`, () => {
    assert.equal(detectCommerceIntent(phrase), "PRODUCT_SEARCH");
  });
}

test("detects RECOMMENDATION for budget gift query", () => {
  assert.equal(detectCommerceIntent("Recommend a gift under ₹1000"), "RECOMMENDATION");
});

test("detects RECOMMENDATION for phone budget query", () => {
  assert.equal(
    detectCommerceIntent("Recommend a phone under ₹20,000"),
    "RECOMMENDATION",
  );
});

const BASKET_RECOMMENDATION_PHRASES = [
  "I want ingredients to bake a cake under ₹300",
  "What should I cook tonight?",
  "Suggest breakfast items",
  "I need groceries for 2 people",
  "Healthy snacks under ₹200",
  "I want a high protein lunch",
  "High protein foods",
  "Weight loss meal ideas",
];

for (const phrase of BASKET_RECOMMENDATION_PHRASES) {
  test(`detects RECOMMENDATION for basket query "${phrase}"`, () => {
    assert.equal(detectCommerceIntent(phrase), "RECOMMENDATION");
  });
}

const MEAL_PLANNING_PHRASES = [
  "I want a high protein lunch",
  "Suggest a healthy breakfast",
  "Recommend dinner under ₹300",
  "What can I cook with these ingredients?",
  "I need ingredients for a cake",
  "High protein foods",
  "Weight loss meal ideas",
];

for (const phrase of MEAL_PLANNING_PHRASES) {
  test(`meal planning "${phrase}" is not CART_ADD or product lookup failure`, () => {
    const { isExplicitProductLookup, isCartAddRequest } = require("../src/lib/ai/message-intent.ts");
    assert.equal(detectCommerceIntent(phrase), "RECOMMENDATION");
    assert.equal(isCartAddRequest(phrase), false);
    assert.equal(isExplicitProductLookup(phrase), false);
  });
}

const OPEN_RECOMMENDATION_PHRASES = [
  "what do u recommend to buy",
  "suggest products",
  "recommend something",
];

for (const phrase of OPEN_RECOMMENDATION_PHRASES) {
  test(`open recommendation "${phrase}" routes to PRODUCT_RECOMMENDATION`, () => {
    const { classifyAiRoute } = require("../src/lib/ai/ai-router.ts");
    assert.equal(detectCommerceIntent(phrase), "RECOMMENDATION");
    assert.equal(classifyAiRoute(phrase).type, "PRODUCT_RECOMMENDATION");
  });
}

test("explicit unknown product stays CART_ADD", () => {
  assert.equal(detectCommerceIntent("I want xyznonexistentproduct123"), "CART_ADD");
});

test("detects RETURN_POLICY for return policy question", () => {
  assert.equal(detectCommerceIntent("What's your return policy?"), "RETURN_POLICY");
});

test("detects REFUND_POLICY for refund policy question", () => {
  assert.equal(detectCommerceIntent("What is your refund policy?"), "REFUND_POLICY");
});

test("detects SUPPORT for help request", () => {
  assert.equal(detectCommerceIntent("Help"), "SUPPORT");
});

test("return policy is not classified as product catalog", () => {
  assert.notEqual(detectCommerceIntent("What's your return policy?"), "PRODUCT_CATALOG");
});

const RETURN_REQUEST_PHRASES = [
  "I want to return what I just ordered",
  "I want to return my order",
  "Return this item",
  "I received a damaged product",
  "I want a refund",
  "I am unhappy with my order",
  "im unhappy with the quality i want to file a complaint/ return and get refund",
  "my item was broken",
  "wrong item received",
  "poor quality product",
  "issue with order",
];

for (const phrase of RETURN_REQUEST_PHRASES) {
  test(`detects return/refund request for "${phrase}"`, () => {
    const intent = detectCommerceIntent(phrase);
    assert.ok(
      intent === "RETURN_REQUEST" ||
        intent === "REFUND_REQUEST" ||
        intent === "COMPLAINT",
      `expected RETURN_REQUEST, REFUND_REQUEST, or COMPLAINT, got ${intent}`,
    );
    assert.notEqual(intent, "CART_ADD");
    assert.notEqual(intent, "PRODUCT_SEARCH");
  });
}

test("quality complaint does not fall through to cart add or product lookup", () => {
  const phrase =
    "im unhappy with the quality i want to file a complaint/ return and get refund";
  assert.equal(detectCommerceIntent(phrase), "RETURN_REQUEST");
  const { classifyAiRoute } = require("../src/lib/ai/ai-router.ts");
  assert.equal(classifyAiRoute(phrase).type, "ORDER_RETURN");
  const { isExplicitProductLookup, isCartAddRequest } = require("../src/lib/ai/message-intent.ts");
  assert.equal(isCartAddRequest(phrase), false);
  assert.equal(isExplicitProductLookup(phrase), false);
});

test("how do returns work is return policy not request", () => {
  assert.equal(detectCommerceIntent("How do returns work?"), "RETURN_POLICY");
});

console.log("\nAll message intent checks passed.");
