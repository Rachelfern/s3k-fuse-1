import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  rankHighProteinProducts,
  buildHighProteinRecommendationIntro,
  isHighProteinRecommendationRequest,
} = require("../src/lib/ai/nutrition-recommendations.ts");
const { selectRecommendationProducts } = require("../src/lib/ai/product-catalog.ts");

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
    id: "broccoli",
    name_en: "Broccoli 1pc",
    description: "Fresh green broccoli",
    category: "Vegetables",
    price: 29,
  },
  {
    id: "milk",
    name_en: "Farm Fresh Milk 1L",
    description: "Fresh dairy milk",
    category: "Dairy",
    price: 75,
  },
  {
    id: "tomatoes",
    name_en: "Tomatoes 500g",
    description: "Farm-fresh tomatoes",
    category: "Vegetables",
    price: 18,
  },
  {
    id: "chicken",
    name_en: "Chicken Breast 500g",
    description: "Lean boneless chicken breast — high protein",
    category: "Meat",
    price: 100,
  },
  {
    id: "mango",
    name_en: "Alphonso Mango",
    description: "Sweet seasonal mangoes",
    category: "Fruits",
    price: 34,
  },
];

test("detects high-protein recommendation queries", () => {
  for (const phrase of [
    "I want a high protein meal",
    "post workout lunch",
    "healthy dinner ideas",
    "muscle gain foods",
  ]) {
    assert.equal(isHighProteinRecommendationRequest(phrase), true, phrase);
  }
});

test("ranks chicken before dairy before broccoli; excludes tomatoes", () => {
  const ranked = rankHighProteinProducts(catalog, 3);
  assert.deepEqual(
    ranked.map((product) => product.name_en),
    ["Chicken Breast 500g", "Farm Fresh Milk 1L", "Broccoli 1pc"],
  );
});

test("never picks tomatoes when chicken is available", () => {
  const ranked = rankHighProteinProducts(catalog, 4);
  const names = ranked.map((product) => product.name_en);
  assert.ok(names.includes("Chicken Breast 500g"));
  assert.ok(!names.includes("Tomatoes 500g"));
});

test("selectRecommendationProducts uses nutrition ranking for high-protein meal", () => {
  const picks = selectRecommendationProducts({
    message: "I want a high protein meal",
    catalog,
    bestSellerIds: ["tomatoes", "broccoli"],
    limit: 3,
  });

  assert.deepEqual(
    picks.map((product) => product.name_en),
    ["Chicken Breast 500g", "Farm Fresh Milk 1L", "Broccoli 1pc"],
  );
});

test("builds explanatory intro with estimated total", () => {
  const ranked = rankHighProteinProducts(catalog, 3);
  const intro = buildHighProteinRecommendationIntro(ranked);

  assert.match(intro, /For a high-protein meal, I recommend:/);
  assert.match(intro, /🍗 Chicken Breast 500g - excellent protein source/);
  assert.match(intro, /🥛 Farm Fresh Milk 1L - additional protein and calcium/);
  assert.match(intro, /🥦 Broccoli 1pc - nutritious side dish with plant protein/);
  assert.match(intro, /Estimated total: ₹204/);
});

console.log("\nAll nutrition recommendation checks passed.");
