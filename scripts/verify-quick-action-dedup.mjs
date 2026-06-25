import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  adminMessageMatchesQuickAction,
  dedupeMessages,
  getQuickActionKey,
  shouldSkipDuplicateQuickAction,
} = require("../src/lib/chat/quick-action-dedup.ts");
const {
  encodeQuickActionIntent,
  parseQuickActionTaggedIntent,
  resolveMessageIntent,
} = require("../src/lib/chat/quick-action-intent.ts");
const { parseRecommendationProductIds } = require("../src/lib/ai/message-intent.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("tags and resolves quick-action intents", () => {
  const tagged = encodeQuickActionIntent(
    "best_sellers",
    "recommendation|prod-1,prod-2",
  );
  assert.equal(parseQuickActionTaggedIntent(tagged)?.actionKey, "best_sellers");
  assert.equal(
    resolveMessageIntent(tagged),
    "recommendation|prod-1,prod-2",
  );
  assert.deepEqual(parseRecommendationProductIds(tagged), ["prod-1", "prod-2"]);
});

test("resolves order-scoped return quick-action intents", () => {
  const orderId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const actionKey = getQuickActionKey(`return_entire|${orderId}`);
  const baseIntent = `return_reason_choice|${orderId}|entire`;
  const tagged = encodeQuickActionIntent(actionKey, baseIntent);

  assert.equal(actionKey, `return_entire:${orderId}`);
  assert.deepEqual(parseQuickActionTaggedIntent(tagged), {
    actionKey,
    baseIntent,
  });
  assert.equal(resolveMessageIntent(tagged), baseIntent);
});

test("detects duplicate best sellers response", () => {
  const latestAdmin = {
    id: "admin-1",
    conversation_id: "conv-1",
    sender_type: "admin",
    content: "Here are our current best-selling products:",
    intent: encodeQuickActionIntent(
      "best_sellers",
      "recommendation|prod-1,prod-2",
    ),
    was_ai_drafted: false,
    created_at: new Date().toISOString(),
  };

  assert.equal(getQuickActionKey("Best Sellers"), "best_sellers");
  assert.equal(
    shouldSkipDuplicateQuickAction("best_sellers", [latestAdmin]),
    true,
  );
  assert.equal(
    shouldSkipDuplicateQuickAction("browse_products", [latestAdmin]),
    false,
  );
  assert.equal(adminMessageMatchesQuickAction(latestAdmin, "best_sellers"), true);
});

test("meal recommendation does not block best sellers quick action", () => {
  const mealRecommendation = {
    id: "admin-meal",
    conversation_id: "conv-1",
    sender_type: "admin",
    content: "For a high-protein meal, I recommend:",
    intent: "recommendation|prod-1,prod-2",
    was_ai_drafted: false,
    created_at: new Date().toISOString(),
  };

  assert.equal(
    shouldSkipDuplicateQuickAction("best_sellers", [mealRecommendation]),
    false,
  );
  assert.equal(
    adminMessageMatchesQuickAction(mealRecommendation, "best_sellers"),
    false,
  );
});

test("dedupes tagged admin responses with the same action key", () => {
  const first = {
    id: "admin-1",
    conversation_id: "conv-1",
    sender_type: "admin",
    content: "List 1",
    intent: encodeQuickActionIntent("best_sellers", "recommendation|a,b"),
    was_ai_drafted: false,
    created_at: "2026-01-01T10:00:00.000Z",
  };
  const duplicate = {
    id: "admin-2",
    conversation_id: "conv-1",
    sender_type: "admin",
    content: "List 2",
    intent: encodeQuickActionIntent("best_sellers", "recommendation|a,b"),
    was_ai_drafted: false,
    created_at: "2026-01-01T10:00:01.000Z",
  };
  const other = {
    id: "admin-3",
    conversation_id: "conv-1",
    sender_type: "admin",
    content: "Browse",
    intent: encodeQuickActionIntent("browse_products", "browse_products"),
    was_ai_drafted: false,
    created_at: "2026-01-01T10:00:02.000Z",
  };

  assert.deepEqual(dedupeMessages([first, duplicate, other]), [first, other]);
});

console.log("\nAll quick-action dedup checks passed.");
