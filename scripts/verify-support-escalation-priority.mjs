import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  isNormalCommerceAction,
  isSupportEscalationMessage,
  detectUrgentEscalation,
  resolveConversationPriority,
  alignPriorityWithSuggestedAction,
  SUPPORT_HIGH_CLASSIFICATION,
  URGENT_CLASSIFICATION,
} = require("../src/lib/support/conversation-priority.ts");

const {
  classifyCustomerMessage,
  mergeIssueClassifications,
  priorityBadgeLabel,
} = require("../src/lib/ai/issue-classifier.ts");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const baseExisting = {
  issueType: "NORMAL",
  priorityScore: 10,
  priorityLevel: "normal",
  needsHumanAssistance: false,
  supportTicketId: null,
};

test("Contact Support escalates to HIGH", () => {
  const result = resolveConversationPriority({
    latestMessage: "Contact Support",
    messages: [{ sender_type: "customer", content: "Contact Support" }],
    existing: baseExisting,
  });
  assert.equal(result.priorityLevel, "high");
  assert.equal(result.issueType, "SUPPORT");
});

test("support ticket metadata keeps HIGH priority", () => {
  const result = resolveConversationPriority({
    latestMessage: "hello",
    messages: [{ sender_type: "customer", content: "hello" }],
    existing: {
      ...baseExisting,
      supportTicketId: "sup_abc123",
      needsHumanAssistance: true,
      issueType: "SUPPORT",
      priorityScore: 75,
      priorityLevel: "high",
    },
  });
  assert.equal(result.priorityLevel, "high");
});

test("commerce browse stays NORMAL", () => {
  const result = resolveConversationPriority({
    latestMessage: "browse products",
    messages: [{ sender_type: "customer", content: "browse products" }],
    existing: {
      ...baseExisting,
      supportTicketId: "sup_abc123",
      priorityScore: 75,
      priorityLevel: "high",
    },
  });
  assert.equal(result.priorityLevel, "normal");
});

test("damaged item escalates to URGENT", () => {
  assert.equal(detectUrgentEscalation("My item arrived damaged"), true);
  const result = resolveConversationPriority({
    latestMessage: "My item arrived damaged",
    messages: [{ sender_type: "customer", content: "My item arrived damaged" }],
    existing: baseExisting,
  });
  assert.equal(result.priorityLevel, "critical");
  assert.equal(result.issueType, "URGENT");
});

test("double charge escalates to URGENT", () => {
  const result = resolveConversationPriority({
    latestMessage: "I was charged twice for the same order",
    messages: [
      { sender_type: "customer", content: "I was charged twice for the same order" },
    ],
    existing: baseExisting,
  });
  assert.equal(result.priorityLevel, "critical");
});

test("support ticket creation hint sets HIGH", () => {
  const result = resolveConversationPriority({
    latestMessage: "Contact Support",
    messages: [{ sender_type: "customer", content: "Contact Support" }],
    existing: baseExisting,
    hints: { supportTicketCreated: true, supportTicketId: "sup_test" },
  });
  assert.equal(result.priorityLevel, "high");
});

test("Follow up with customer aligns to HIGH for support context", () => {
  const aligned = alignPriorityWithSuggestedAction({
    classification: classifyCustomerMessage("still waiting"),
    suggestedAction: "Follow up with customer",
    hasSupportContext: true,
    isCommerceAction: false,
  });
  assert.equal(aligned.priorityLevel, "high");
});

test("Follow up with customer stays NORMAL for commerce", () => {
  const aligned = alignPriorityWithSuggestedAction({
    classification: classifyCustomerMessage("browse products"),
    suggestedAction: "Follow up with customer",
    hasSupportContext: false,
    isCommerceAction: true,
  });
  assert.equal(aligned.priorityLevel, "normal");
});

test("priority never downgrades existing HIGH without commerce action", () => {
  const result = resolveConversationPriority({
    latestMessage: "ok thanks",
    messages: [{ sender_type: "customer", content: "ok thanks" }],
    existing: {
      ...baseExisting,
      issueType: "SUPPORT",
      priorityScore: 75,
      priorityLevel: "high",
      supportTicketId: "sup_abc123",
    },
  });
  assert.equal(result.priorityLevel, "high");
});

test("urgent badge label", () => {
  assert.equal(priorityBadgeLabel("critical"), "Urgent");
  assert.equal(priorityBadgeLabel("high"), "High");
  assert.equal(priorityBadgeLabel("normal"), "Normal");
});

test("merge keeps higher priority", () => {
  const merged = mergeIssueClassifications(
    SUPPORT_HIGH_CLASSIFICATION,
    URGENT_CLASSIFICATION,
  );
  assert.equal(merged.priorityLevel, "critical");
});

console.log("\nAll support escalation priority checks passed.");
