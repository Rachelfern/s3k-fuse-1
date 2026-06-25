import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  formatConversationTranscript,
  findRecentCodCollectionFailedOrderId,
  formatConversationMemoryForPrompt,
  rejectsExistingOrderContext,
  buildContextAwareFallbackReply,
} = require("../src/lib/ai/conversation-context.ts");

const {
  detectDeliveryRescheduleIntent,
} = require("../src/lib/orders/cod-reschedule-flow.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const codSystemMessage = {
  sender_type: "system",
  intent: "cod_collection_failed|o_abc12345",
  content: `⚠️ COD Payment Not Collected

Order: o_abc12345
Amount: ₹499

Your Cash on Delivery payment could not be collected. Please contact support or arrange another payment method.

Status: Action Required`,
};

test("finds COD order id from system notification", () => {
  const orderId = findRecentCodCollectionFailedOrderId([codSystemMessage]);
  assert.equal(orderId, "o_abc12345");
});

test("formats transcript with roles and intents", () => {
  const transcript = formatConversationTranscript([
    codSystemMessage,
    {
      sender_type: "customer",
      intent: null,
      content: "ok im free tomorrow you can deliver then",
    },
  ]);

  assert.match(transcript, /System \[intent: cod_collection_failed\|o_abc12345\]/);
  assert.match(transcript, /Customer: ok im free tomorrow/);
});

test("detects delivery reschedule intent", () => {
  assert.equal(
    detectDeliveryRescheduleIntent("ok im free tomorrow you can deliver then"),
    true,
  );
  assert.equal(detectDeliveryRescheduleIntent("show me protein powder"), false);
});

test("memory prompt includes active order and pending COD context", () => {
  const prompt = formatConversationMemoryForPrompt({
    transcript: formatConversationTranscript([
      codSystemMessage,
      {
        sender_type: "customer",
        intent: null,
        content: "ok im free tomorrow you can deliver then",
      },
    ]),
    recentMessages: [],
    recentSystemNotifications: [codSystemMessage.content],
    activeOrder: {
      id: "o_abc12345",
      status: "shipped",
      total_amount: 499,
      payment_status: "failed",
      payment_method: "cod",
      shipment_status: "in_transit",
      tracking_id: "TRK123",
      delivery_address: "12 MG Road, Mumbai",
      notes: null,
      created_at: "2025-06-24T10:00:00.000Z",
    },
    recentOrders: [],
    activeReturnRequests: [],
    supportTickets: [],
    pendingContext: {
      type: "cod_collection_failed",
      orderId: "o_abc12345",
      summary: "COD not collected",
    },
    hasActiveOrder: true,
  });

  assert.match(prompt, /Active Order/);
  assert.match(prompt, /o_abc12345/);
  assert.match(prompt, /Pending Action Context/);
  assert.match(prompt, /COD Payment Not Collected/);
});

test("rejects false no-order claims when order exists", () => {
  const memory = { hasActiveOrder: true };
  assert.equal(
    rejectsExistingOrderContext(
      "I don't have any information about an upcoming order.",
      memory,
    ),
    true,
  );
  assert.equal(
    rejectsExistingOrderContext(
      "Your order o_abc12345 is out for delivery.",
      memory,
    ),
    false,
  );
});

test("builds COD-aware fallback reply", () => {
  const reply = buildContextAwareFallbackReply(
    {
      transcript: "",
      recentMessages: [],
      recentSystemNotifications: [],
      activeOrder: {
        id: "o_abc12345",
        status: "shipped",
        total_amount: 499,
        payment_status: "failed",
        payment_method: "cod",
        shipment_status: "in_transit",
        tracking_id: null,
        delivery_address: null,
        notes: null,
        created_at: "2025-06-24T10:00:00.000Z",
      },
      recentOrders: [],
      activeReturnRequests: [],
      supportTickets: [],
      pendingContext: {
        type: "cod_collection_failed",
        orderId: "o_abc12345",
        summary: "COD not collected",
      },
      hasActiveOrder: true,
    },
    "ok im free tomorrow you can deliver then",
  );

  assert.match(reply, /o_abc12345/);
  assert.match(reply, /availability/i);
});

console.log("\nAll conversation context checks passed.");
