import assert from "node:assert/strict";
import { parseCartIntent, extractProductQuery, extractRequestedQuantity } from "../src/lib/ai/cart-parser.ts";
import { classifyCustomerIntent, detectCommerceIntent } from "../src/lib/ai/message-intent.ts";
import { searchProductsForCart } from "../src/lib/ai/product-search.ts";
import {
  extractProductEntity,
  extractProductSegments,
  normalizeWordQuantities,
  splitMultiProductMessage,
} from "../src/lib/ai/product-entity-extraction.ts";
import {
  parseRemoveRequest,
  findCartItemsForRemoval,
} from "../src/lib/ai/cart-remove-parser.ts";

const catalog = [
  {
    id: "mango",
    name_en: "Alphonso Mango",
    name_hi: "आम",
    price: 34,
    image_url: null,
    description: "Sweet seasonal mangoes",
    category: "Fruits",
  },
  {
    id: "tomatoes",
    name_en: "Tomatoes 500g",
    name_hi: "टमाटर",
    price: 18,
    image_url: null,
    description: "Farm-fresh tomatoes",
    category: "Vegetables",
  },
  {
    id: "milk-1l",
    name_en: "Farm Fresh Milk 1L",
    name_hi: "दूध",
    price: 75,
    image_url: null,
    description: "Fresh dairy milk",
    category: "Dairy",
  },
  {
    id: "milk-500",
    name_en: "Farm Fresh Milk 500ml",
    name_hi: "दूध",
    price: 45,
    image_url: null,
    description: "Fresh dairy milk",
    category: "Dairy",
  },
  {
    id: "banana",
    name_en: "Fresh Banana",
    name_hi: "केला",
    price: 25,
    image_url: null,
    description: "Ripe bananas",
    category: "Fruits",
  },
];

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("classifies natural add-to-cart phrasing", () => {
  assert.equal(
    classifyCustomerIntent("I want to add 1500g tomatoes in the cart"),
    "CART_ADD",
  );
});

test("matches weight conversion for tomatoes", () => {
  const result = parseCartIntent("Add 1500g tomatoes", catalog);
  assert.equal(result.status, "confirm");
  assert.equal(result.lines[0].product.name_en, "Tomatoes 500g");
  assert.equal(result.lines[0].quantity, 3);
  assert.match(result.message, /3 packs/i);
});

test("matches volume request for milk", () => {
  const result = parseCartIntent("Add 3 litres of milk", catalog);
  assert.equal(result.status, "ready");
  assert.equal(result.lines[0].product.name_en, "Farm Fresh Milk 1L");
  assert.equal(result.lines[0].quantity, 3);
});

test("matches singular tomato", () => {
  const matches = searchProductsForCart("tomato", catalog);
  assert.equal(matches[0]?.product.name_en, "Tomatoes 500g");
});

test("matches partial milk name", () => {
  const matches = searchProductsForCart("milk", catalog);
  assert.ok(matches.length >= 1);
  assert.match(matches[0].product.name_en, /Milk/i);
});

test("tolerates tomato typo", () => {
  const result = parseCartIntent("add tomatos", catalog);
  assert.notEqual(result.status, "no_match");
});

test("asks clarification when multiple milk sizes match", () => {
  const result = parseCartIntent("Add milk", catalog);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 2);
});

test("extracts smart quantities", () => {
  assert.equal(extractRequestedQuantity("2kg tomatoes")?.kind, "weight");
  assert.equal(extractRequestedQuantity("6 bananas")?.kind, "count");
  assert.equal(extractProductQuery("2 packets biscuits"), "biscuits");
});

test("normalizes word quantities", () => {
  assert.equal(normalizeWordQuantities("add two tomatoes"), "add 2 tomatoes");
  assert.equal(normalizeWordQuantities("three bananas"), "3 bananas");
  assert.equal(extractRequestedQuantity("add two tomatoes")?.kind, "count");
  assert.equal(extractRequestedQuantity("add two tomatoes")?.units, 2);
});

const naturalAddPhrases = [
  ["add tomatoes", "Tomatoes 500g", 1],
  ["add 2 tomatoes", "Tomatoes 500g", 2],
  ["add two tomatoes", "Tomatoes 500g", 2],
  ["put tomatoes in my cart", "Tomatoes 500g", 1],
  ["i want tomatoes", "Tomatoes 500g", 1],
  ["add banana", "Fresh Banana", 1],
  ["add 3 bananas", "Fresh Banana", 3],
];

for (const [phrase, expectedProduct, expectedQty] of naturalAddPhrases) {
  test(`resolves "${phrase}"`, () => {
    assert.equal(detectCommerceIntent(phrase), "CART_ADD", `intent for: ${phrase}`);
    const result = parseCartIntent(phrase, catalog);
    assert.equal(result.status, "ready", `status for: ${phrase}`);
    assert.equal(result.lines[0].product.name_en, expectedProduct);
    assert.equal(result.lines[0].quantity, expectedQty);
  });
}

test("entity extraction strips cart verbs", () => {
  assert.equal(extractProductEntity("put tomatoes in my cart").productQuery, "tomatoes");
  assert.equal(extractProductEntity("i want tomatoes").productQuery, "tomatoes");
});

test("classifies cart remove intents", () => {
  assert.equal(classifyCustomerIntent("remove tomatoes"), "CART_REMOVE");
  assert.equal(classifyCustomerIntent("delete tomato"), "CART_REMOVE");
  assert.equal(classifyCustomerIntent("take milk out"), "CART_REMOVE");
  assert.equal(classifyCustomerIntent("remove 2 tomato packs"), "CART_REMOVE");
  assert.equal(classifyCustomerIntent("remove all tomatoes"), "CART_REMOVE");
});

test("parses remove requests with fuzzy product names", () => {
  const request = parseRemoveRequest("remove tomato");
  assert.equal(request?.productQuery, "tomato");
  assert.equal(request?.quantity.mode, "all_matching");

  const partial = parseRemoveRequest("remove 2 tomato packs");
  assert.equal(partial?.quantity.mode, "partial");
  assert.equal(partial?.quantity.amount, 2);
});

test("matches cart lines for removal using fuzzy search", () => {
  const cartLines = [
    {
      cartItemId: "line-1",
      product_id: "tomatoes",
      name_en: "Tomatoes 500g",
      quantity: 4,
      price: 18,
    },
  ];

  const matches = findCartItemsForRemoval("tomato", cartLines);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name_en, "Tomatoes 500g");
});

const multiProductCatalog = catalog.filter((item) => item.id !== "milk-500");

const MULTI_PRODUCT_CASES = [
  {
    phrase: "do aam aur ek doodh chahiye",
    lines: [
      { name: "Alphonso Mango", quantity: 2 },
      { name: "Farm Fresh Milk 1L", quantity: 1 },
    ],
  },
  {
    phrase: "2 mango and 1 milk",
    lines: [
      { name: "Alphonso Mango", quantity: 2 },
      { name: "Farm Fresh Milk 1L", quantity: 1 },
    ],
  },
  {
    phrase: "ek doodh aur do kele",
    lines: [
      { name: "Farm Fresh Milk 1L", quantity: 1 },
      { name: "Fresh Banana", quantity: 2 },
    ],
  },
  {
    phrase: "3 mangoes + 2 milk",
    lines: [
      { name: "Alphonso Mango", quantity: 3 },
      { name: "Farm Fresh Milk 1L", quantity: 2 },
    ],
  },
];

for (const { phrase, lines: expectedLines } of MULTI_PRODUCT_CASES) {
  test(`parses multi-product request "${phrase}"`, () => {
    assert.equal(detectCommerceIntent(phrase), "CART_ADD");
    assert.equal(splitMultiProductMessage(phrase).length, expectedLines.length);
    const result = parseCartIntent(phrase, multiProductCatalog);
    assert.equal(result.status, "ready", `status for: ${phrase}`);
    assert.equal(result.lines.length, expectedLines.length, `line count for: ${phrase}`);
    for (let index = 0; index < expectedLines.length; index += 1) {
      assert.match(
        result.lines[index].product.name_en,
        new RegExp(expectedLines[index].name, "i"),
        `product ${index} for: ${phrase}`,
      );
      assert.equal(
        result.lines[index].quantity,
        expectedLines[index].quantity,
        `quantity ${index} for: ${phrase}`,
      );
    }
  });
}

test("extractProductSegments returns one entity per product", () => {
  const segments = extractProductSegments("do aam aur ek doodh chahiye");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].productQuery, "mango");
  assert.equal(segments[1].productQuery, "milk");
});

console.log("\nAll cart parser checks passed.");
