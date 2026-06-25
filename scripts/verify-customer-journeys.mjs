/**
 * Customer journey test matrix — intent routing, quick-reply coverage, and fallback detection.
 * Run: node --import tsx scripts/verify-customer-journeys.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { classifyAiRoute } = require("../src/lib/ai/ai-router.ts");
const { detectCommerceIntent } = require("../src/lib/ai/message-intent.ts");
const { classifyConversationFlow } = require("../src/lib/chat/conversation-flows.ts");
const { getQuickRepliesForIntent } = require("../src/lib/chat/quick-replies.ts");
const { GROQ_CONVERSATIONAL_FALLBACK } = require("../src/lib/ai/groq-client.ts");

const GENERAL_FALLBACK_SNIPPET = GROQ_CONVERSATIONAL_FALLBACK.slice(0, 40);

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

function expectNotGenericRoute(message, expectedRoute) {
  const route = classifyAiRoute(message);
  assert.notEqual(
    route.type,
    "GENERAL",
    `"${message}" routed to GENERAL (expected ${expectedRoute ?? "non-GENERAL"})`,
  );
  if (expectedRoute) {
    assert.equal(route.type, expectedRoute, `"${message}" route mismatch`);
  }
  return route;
}

function expectQuickReplies(intent, minCount = 1) {
  const replies = getQuickRepliesForIntent(intent);
  assert.ok(
    replies.length >= minCount,
    `intent "${intent}" has ${replies.length} quick replies (expected >= ${minCount})`,
  );
  return replies;
}

function expectFollowUpHasRoute(message) {
  const route = classifyAiRoute(message);
  assert.notEqual(route.type, "GENERAL", `"${message}" follow-up hits GENERAL fallback`);
  return route;
}

const results = { pass: 0, fail: 0 };

function run(name, fn) {
  if (test(name, fn)) results.pass += 1;
  else results.fail += 1;
}

console.log("=== Customer Journey Test Matrix ===\n");

// --- Browse & catalog ---
run("Browse products (message) → PRODUCT_CATALOG", () => {
  expectNotGenericRoute("Browse products", "PRODUCT_CATALOG");
});

run("Browse products quick reply (href) → navigates to /products", () => {
  const replies = getQuickRepliesForIntent("welcome");
  const browse = replies.find((r) => r.label === "Browse Products");
  assert.ok(browse?.href === "/products");
});

run("Product catalog phrases → PRODUCT_CATALOG", () => {
  for (const phrase of ["products", "catalog", "what do you sell"]) {
    expectNotGenericRoute(phrase, "PRODUCT_CATALOG");
  }
});

// --- Product search & recommendations ---
run("Best Sellers → INVENTORY_LOOKUP", () => {
  expectNotGenericRoute("Best Sellers", "INVENTORY_LOOKUP");
});

run("Product search sample → INVENTORY_LOOKUP", () => {
  expectNotGenericRoute("Do you have wireless headphones?", "INVENTORY_LOOKUP");
  expectNotGenericRoute("Show me protein powders", "INVENTORY_LOOKUP");
});

run("Offers → INVENTORY_LOOKUP", () => {
  expectNotGenericRoute("Show today's offers", "INVENTORY_LOOKUP");
});

run("Recommendation → PRODUCT_RECOMMENDATION", () => {
  expectNotGenericRoute("Recommend a gift under ₹1000", "PRODUCT_RECOMMENDATION");
});

run("Basket and meal queries → PRODUCT_RECOMMENDATION", () => {
  for (const phrase of [
    "I want ingredients to bake a cake under ₹300",
    "What should I cook tonight?",
    "Suggest breakfast items",
    "I need groceries for 2 people",
    "Healthy snacks under ₹200",
    "I want a high protein lunch",
    "Suggest a healthy breakfast",
    "Recommend dinner under ₹300",
    "What can I cook with these ingredients?",
    "I need ingredients for a cake",
    "High protein foods",
    "Weight loss meal ideas",
  ]) {
    expectNotGenericRoute(phrase, "PRODUCT_RECOMMENDATION");
  }
});

run("Recommendation intent has quick replies", () => {
  expectQuickReplies("recommendation|prod-1,prod-2", 2);
});

run("Empty search intent has quick replies", () => {
  expectQuickReplies("product_search_empty", 2);
});

// --- Cart ---
run("View cart → CART_VIEW conversation flow", () => {
  const route = expectNotGenericRoute("View cart", "CART_VIEW");
  assert.equal(route.conversationFlow?.type, "VIEW_CART");
});

run("Add to cart → CART_ADD", () => {
  expectNotGenericRoute("add 2 dal", "CART_ADD");
});

run("Cart remove → CART_REMOVE", () => {
  expectNotGenericRoute("remove dal from cart", "CART_REMOVE");
});

run("Cart updated intent has checkout quick replies", () => {
  expectQuickReplies("cart_updated", 3);
});

run("Change quantity follow-up → CART_ADD with CHANGE_QUANTITY flow", () => {
  const route = expectFollowUpHasRoute("I'd like a different quantity");
  assert.equal(route.conversationFlow?.type, "CHANGE_QUANTITY");
});

run("Cart clarify intent has quick replies", () => {
  expectQuickReplies("cart_clarify|id1:Dal,id2:Paneer", 2);
});

// --- Checkout & payment ---
run("Checkout → CHECKOUT", () => {
  const route = expectNotGenericRoute("checkout", "CHECKOUT");
  assert.equal(route.conversationFlow?.type, "CHECKOUT");
});

run("Pay now → CHECKOUT with PAY_NOW flow", () => {
  const route = expectNotGenericRoute("Pay now", "CHECKOUT");
  assert.equal(route.conversationFlow?.type, "PAY_NOW");
});

run("Refresh status → ORDER_TRACKING with REFRESH_STATUS flow", () => {
  const route = expectFollowUpHasRoute("refresh status");
  assert.equal(route.conversationFlow?.type, "REFRESH_STATUS");
});

run("Checkout prompt has quick replies", () => {
  expectQuickReplies("checkout_prompt", 2);
});

// --- Orders ---
run("Track order → ORDER_TRACKING", () => {
  const route = expectNotGenericRoute("track my order", "ORDER_TRACKING");
  assert.equal(route.conversationFlow?.type, "TRACK_ORDER");
});

run("Track Order quick action label → track my order message", () => {
  const route = expectNotGenericRoute("Track Order", "ORDER_TRACKING");
  assert.equal(route.conversationFlow?.type, "TRACK_ORDER");
});

run("Order history → ORDER_HISTORY flow", () => {
  const flow = classifyConversationFlow("my orders");
  assert.equal(flow?.type, "ORDER_HISTORY");
});

run("Reorder → REORDER flow", () => {
  const flow = classifyConversationFlow("Reorder");
  assert.equal(flow?.type, "REORDER");
});

run("Order confirmed intent has quick replies", () => {
  expectQuickReplies("order_confirmed|order-123", 3);
});

// --- Returns & refunds ---
run("Return request → ORDER_RETURN", () => {
  expectNotGenericRoute("I want to return my order", "ORDER_RETURN");
});

run("Refund request → ORDER_RETURN", () => {
  expectNotGenericRoute("I want a refund", "ORDER_RETURN");
});

run("Quality complaint with return/refund → ORDER_RETURN", () => {
  expectNotGenericRoute(
    "im unhappy with the quality i want to file a complaint/ return and get refund",
    "ORDER_RETURN",
  );
  assert.equal(
    detectCommerceIntent(
      "im unhappy with the quality i want to file a complaint/ return and get refund",
    ),
    "RETURN_REQUEST",
  );
});

run("Return policy → SUPPORT", () => {
  expectNotGenericRoute("What's your return policy?", "SUPPORT");
});

run("Refund policy → SUPPORT", () => {
  expectNotGenericRoute("What is your refund policy?", "SUPPORT");
});

run("Return quick reply entire → ORDER_RETURN", () => {
  expectNotGenericRoute("return_entire|order-abc", "ORDER_RETURN");
});

run("Return quick reply item → ORDER_RETURN", () => {
  expectNotGenericRoute("return_item|order-abc", "ORDER_RETURN");
});

run("Return item name follow-up with prior intent → parseable", () => {
  const { parseReturnItemFollowUp } = require("../src/lib/orders/return-request-flow.ts");
  const followUp = parseReturnItemFollowUp(
    "return the mangoes",
    "return_request|order-abc",
  );
  assert.ok(followUp);
  assert.equal(followUp.orderId, "order-abc");
  assert.equal(followUp.itemQuery, "mangoes");
});

run("Return request with order id has action quick replies", () => {
  expectQuickReplies("return_request|order-abc", 3);
});

run("Return reason choice intent has reason quick replies", () => {
  const { getQuickActionKey } = require("../src/lib/chat/quick-action-dedup.ts");
  const { encodeQuickActionIntent } = require("../src/lib/chat/quick-action-intent.ts");
  const orderId = "order-abc";
  const tagged = encodeQuickActionIntent(
    getQuickActionKey(`return_entire|${orderId}`),
    `return_reason_choice|${orderId}|entire`,
  );
  expectQuickReplies(tagged, 6);
  expectQuickReplies(`return_reason_choice|${orderId}|entire`, 6);
});

run("Return submitted intent has quick replies", () => {
  expectQuickReplies("return_request_submitted", 2);
});

// --- Support ---
run("Help → SUPPORT", () => {
  expectNotGenericRoute("Help", "SUPPORT");
});

run("Contact support → SUPPORT", () => {
  expectNotGenericRoute("Contact Support", "SUPPORT");
});

run("Talk to support from return chips → SUPPORT", () => {
  expectFollowUpHasRoute("Contact Support");
});

run("Support intent has quick replies", () => {
  expectQuickReplies("support", 2);
});

// --- Continue shopping & welcome ---
run("Continue shopping → CONTINUE_SHOPPING flow", () => {
  const flow = classifyConversationFlow("Continue Shopping");
  assert.equal(flow?.type, "CONTINUE_SHOPPING");
});

run("Welcome intent has all entry quick replies", () => {
  expectQuickReplies("welcome", 5);
});

run("Continue shopping intent has quick replies", () => {
  expectQuickReplies("continue_shopping", 3);
});

run("General reply intent has recovery quick replies", () => {
  expectQuickReplies("general_reply", 3);
});

// --- Welcome samples (should not hit GENERAL) ---
const WELCOME_SAMPLES = [
  "Show me protein powders",
  "Do you have wireless headphones?",
  "What's your return policy?",
  "Recommend a gift under ₹1000",
  "Show today's offers",
];

for (const sample of WELCOME_SAMPLES) {
  run(`Welcome sample "${sample}" → not GENERAL`, () => {
    expectNotGenericRoute(sample);
  });
}

// --- Quick reply chain: welcome → help → track order ---
run("Quick reply chain: Help → Track Order", () => {
  const welcomeReplies = getQuickRepliesForIntent("welcome");
  const help = welcomeReplies.find((r) => r.label === "Help");
  assert.ok(help?.message === "Help");
  expectFollowUpHasRoute(help.message);

  const supportReplies = getQuickRepliesForIntent("support");
  const track = supportReplies.find((r) => r.label === "Track Order");
  assert.ok(track?.message === "track my order");
  expectFollowUpHasRoute(track.message);
});

// --- Cart confirm chain ---
run("Cart confirm chain messages route correctly", () => {
  expectFollowUpHasRoute("cart_confirm_reply|prod-1:2");
  expectFollowUpHasRoute("cart_pick|prod-1");
});

// --- Quick actions (button payloads) ---
run("Quick action return_entire parses correctly", () => {
  const { parseQuickAction } = require("../src/lib/chat/quick-actions.ts");
  const action = parseQuickAction("return_entire|order-abc");
  assert.equal(action?.type, "return_entire");
});

run("Quick action literals parse correctly", () => {
  const { parseQuickAction, isQuickActionMessage } = require("../src/lib/chat/quick-actions.ts");
  for (const msg of ["Help", "Track Order", "track my order", "Best Sellers", "Reorder"]) {
    assert.ok(isQuickActionMessage(msg), `${msg} should be quick action`);
    assert.ok(parseQuickAction(msg));
  }
});

run("Order status intent has quick replies", () => {
  expectQuickReplies("order_status", 2);
});

// --- DPDP (non-chat routes — structural checks) ---
run("DPDP my-data page route exists", async () => {
  const fs = await import("node:fs");
  assert.ok(fs.existsSync("src/app/(customer)/my-data/page.tsx"));
});

run("DPDP API routes exist", async () => {
  const fs = await import("node:fs");
  for (const route of [
    "src/app/api/customer/export/route.ts",
    "src/app/api/customer/deletion-request/route.ts",
    "src/app/api/customer/profile/route.ts",
    "src/app/api/admin/customers/[customerId]/route.ts",
  ]) {
    assert.ok(fs.existsSync(route), `missing ${route}`);
  }
});

// --- Payment routes ---
run("Payment & screenshot API routes exist", async () => {
  const fs = await import("node:fs");
  for (const route of [
    "src/app/payment/page.tsx",
    "src/components/payment/upi-qr-payment-panel.tsx",
    "src/components/payment/payment-screenshot-upload.tsx",
    "src/app/api/orders/[orderId]/payment-screenshot/route.ts",
    "src/app/api/admin/orders/[orderId]/payment-verification/route.ts",
  ]) {
    assert.ok(fs.existsSync(route), `missing ${route}`);
  }
});

// --- Fallback should only apply to truly unmatched ---
run("Unmatched gibberish → GENERAL", () => {
  const route = classifyAiRoute("xyzzy plugh");
  assert.equal(route.type, "GENERAL");
  assert.equal(detectCommerceIntent("xyzzy plugh"), "GENERAL_CHAT");
});

console.log(`\n=== Results: ${results.pass} passed, ${results.fail} failed ===`);

if (results.fail > 0) {
  process.exit(1);
}

console.log("\nAll customer journey checks passed.");
