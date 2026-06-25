/**
 * S3K Commerce demo seed — run via: npx tsx lib/seed.ts
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUSINESS_ID = "a1000000-0000-4000-8000-000000000001";
const BUSINESS = { id: BUSINESS_ID, name: "S3K Commerce", slug: "vaarta-demo" };

const PRODUCTS = [
  {
    id: "a2000000-0000-4000-8000-000000000001",
    name_en: "Alphonso Mango",
    name_hi: "हापुस आम",
    price: 34,
    category: "Fruits",
    image_url:
      "https://images.unsplash.com/photo-1553279768-865429fa0078?w=400",
  },
  {
    id: "a2000000-0000-4000-8000-000000000002",
    name_en: "Fresh Banana",
    name_hi: "केला",
    price: 25,
    category: "Fruits",
    image_url:
      "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400",
  },
  {
    id: "a2000000-0000-4000-8000-000000000003",
    name_en: "Farm Fresh Milk 1L",
    name_hi: "दूध",
    price: 75,
    category: "Dairy",
    image_url:
      "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400",
  },
  {
    id: "a2000000-0000-4000-8000-000000000004",
    name_en: "Broccoli 1pc",
    name_hi: "ब्रोकली",
    price: 29,
    category: "Vegetables",
    image_url:
      "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400",
  },
  {
    id: "a2000000-0000-4000-8000-000000000005",
    name_en: "Tomatoes 500g",
    name_hi: "टमाटर",
    price: 18,
    category: "Vegetables",
    image_url:
      "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400",
  },
  {
    id: "a2000000-0000-4000-8000-000000000006",
    name_en: "Chicken Breast 500g",
    name_hi: "चिकन ब्रेस्ट",
    price: 100,
    category: "Meat",
    image_url:
      "https://images.unsplash.com/photo-1604503468506-440b70325a3a?w=400",
  },
] as const;

const CUSTOMERS = [
  {
    id: "b1000000-0000-4000-8000-000000000001",
    name: "Varun Bharadwaj",
    phone: "+919867919334",
    address: "12, Indiranagar 1st Stage, Bengaluru 560038",
    order_count: 3,
    total_spent: 520,
  },
  {
    id: "b1000000-0000-4000-8000-000000000002",
    name: "Priya Sharma",
    phone: "+919876543210",
    address: "B-204, Andheri West, Mumbai 400058",
    order_count: 2,
    total_spent: 310,
  },
  {
    id: "b1000000-0000-4000-8000-000000000003",
    name: "Anjana Narayan",
    phone: "+919876543219",
    address: "45, Anna Nagar, Chennai 600040",
    order_count: 2,
    total_spent: 198,
  },
] as const;

const CONVERSATIONS = [
  {
    id: "d1000000-0000-4000-8000-000000000001",
    customer_id: CUSTOMERS[0].id,
    unread_count: 1,
    last_message_at: hoursAgo(1),
    created_at: daysAgo(2),
  },
  {
    id: "d1000000-0000-4000-8000-000000000002",
    customer_id: CUSTOMERS[1].id,
    unread_count: 0,
    last_message_at: hoursAgo(3),
    created_at: daysAgo(2.5),
  },
  {
    id: "d1000000-0000-4000-8000-000000000003",
    customer_id: CUSTOMERS[2].id,
    unread_count: 0,
    last_message_at: hoursAgo(5),
    created_at: daysAgo(1.5),
  },
] as const;

const MESSAGES = [
  {
    id: "e1000000-0000-4000-8000-000000000001",
    conversation_id: CONVERSATIONS[0].id,
    sender_type: "customer",
    content: "Bhai 2 kg alphonso mango chahiye, kitne ka hai?",
    created_at: hoursAgo(2.5),
  },
  {
    id: "e1000000-0000-4000-8000-000000000002",
    conversation_id: CONVERSATIONS[0].id,
    sender_type: "admin",
    content:
      "Namaste Varun! Alphonso Mango ₹34/kg hai. 2 kg = ₹68. Cart mein add kar doon?",
    was_ai_drafted: true,
    created_at: hoursAgo(2.4),
  },
  {
    id: "e1000000-0000-4000-8000-000000000003",
    conversation_id: CONVERSATIONS[0].id,
    sender_type: "customer",
    content: "Haan add karo, aur ek liter doodh bhi",
    created_at: hoursAgo(2.2),
  },
  {
    id: "e1000000-0000-4000-8000-000000000004",
    conversation_id: CONVERSATIONS[0].id,
    sender_type: "system",
    content: "Cart updated: Alphonso Mango x2, Farm Fresh Milk 1L x1",
    created_at: hoursAgo(2.1),
  },
  {
    id: "e1000000-0000-4000-8000-000000000005",
    conversation_id: CONVERSATIONS[0].id,
    sender_type: "admin",
    content: "Done! Total ₹143 + ₹40 delivery. Payment link bheju?",
    was_ai_drafted: false,
    created_at: hoursAgo(1),
  },
  {
    id: "e1000000-0000-4000-8000-000000000006",
    conversation_id: CONVERSATIONS[1].id,
    sender_type: "customer",
    content: "Tomatoes fresh hain? 500g chahiye",
    created_at: hoursAgo(5),
  },
  {
    id: "e1000000-0000-4000-8000-000000000007",
    conversation_id: CONVERSATIONS[1].id,
    sender_type: "admin",
    content:
      "Haan Priya, aaj hi farm se aaye hain. ₹18 for 500g. Add to cart?",
    was_ai_drafted: true,
    created_at: hoursAgo(4.8),
  },
  {
    id: "e1000000-0000-4000-8000-000000000008",
    conversation_id: CONVERSATIONS[1].id,
    sender_type: "customer",
    content: "Ok add karo please",
    created_at: hoursAgo(4.5),
  },
  {
    id: "e1000000-0000-4000-8000-000000000009",
    conversation_id: CONVERSATIONS[1].id,
    sender_type: "system",
    content: "Order o_ord00008 created — payment pending",
    created_at: hoursAgo(4.2),
  },
  {
    id: "e1000000-0000-4000-8000-000000000010",
    conversation_id: CONVERSATIONS[1].id,
    sender_type: "admin",
    content: "Order confirm hone ke liye UPI payment karein. ₹58 total.",
    was_ai_drafted: false,
    created_at: hoursAgo(3),
  },
  {
    id: "e1000000-0000-4000-8000-000000000011",
    conversation_id: CONVERSATIONS[2].id,
    sender_type: "customer",
    content: "Broccoli aur banana dono available?",
    created_at: hoursAgo(8),
  },
  {
    id: "e1000000-0000-4000-8000-000000000012",
    conversation_id: CONVERSATIONS[2].id,
    sender_type: "admin",
    content:
      "Ji Anjana! Broccoli ₹29/pc aur Banana ₹25/dozen available hai.",
    was_ai_drafted: false,
    created_at: hoursAgo(7.8),
  },
  {
    id: "e1000000-0000-4000-8000-000000000013",
    conversation_id: CONVERSATIONS[2].id,
    sender_type: "customer",
    content: "Ek broccoli aur do banana add karo",
    created_at: hoursAgo(7.5),
  },
  {
    id: "e1000000-0000-4000-8000-000000000014",
    conversation_id: CONVERSATIONS[2].id,
    sender_type: "customer",
    content: "Delivery kal tak ho jayegi?",
    created_at: hoursAgo(6),
  },
  {
    id: "e1000000-0000-4000-8000-000000000015",
    conversation_id: CONVERSATIONS[2].id,
    sender_type: "admin",
    content:
      "Haan! Order confirmed hai, kal shaam tak deliver ho jayega. 🚚",
    was_ai_drafted: true,
    created_at: hoursAgo(5),
  },
] as const;

const CARTS = [
  {
    id: "f1000000-0000-4000-8000-000000000001",
    customer_id: CUSTOMERS[0].id,
    conversation_id: CONVERSATIONS[0].id,
    status: "active",
    created_at: hoursAgo(2),
    updated_at: hoursAgo(2.1),
  },
  {
    id: "f1000000-0000-4000-8000-000000000002",
    customer_id: CUSTOMERS[1].id,
    conversation_id: CONVERSATIONS[1].id,
    status: "converted",
    created_at: hoursAgo(4.5),
    updated_at: hoursAgo(4.2),
  },
  {
    id: "f1000000-0000-4000-8000-000000000003",
    customer_id: CUSTOMERS[2].id,
    conversation_id: CONVERSATIONS[2].id,
    status: "converted",
    created_at: hoursAgo(7.5),
    updated_at: hoursAgo(6),
  },
] as const;

const CART_ITEMS = [
  {
    id: "a3000000-0000-4000-8000-000000000001",
    cart_id: CARTS[0].id,
    product_id: PRODUCTS[0].id,
    quantity: 2,
    price_snapshot: 34,
  },
  {
    id: "a3000000-0000-4000-8000-000000000002",
    cart_id: CARTS[0].id,
    product_id: PRODUCTS[2].id,
    quantity: 1,
    price_snapshot: 75,
  },
  {
    id: "a3000000-0000-4000-8000-000000000003",
    cart_id: CARTS[1].id,
    product_id: PRODUCTS[4].id,
    quantity: 1,
    price_snapshot: 18,
  },
  {
    id: "a3000000-0000-4000-8000-000000000004",
    cart_id: CARTS[2].id,
    product_id: PRODUCTS[3].id,
    quantity: 1,
    price_snapshot: 29,
  },
  {
    id: "a3000000-0000-4000-8000-000000000005",
    cart_id: CARTS[2].id,
    product_id: PRODUCTS[1].id,
    quantity: 2,
    price_snapshot: 25,
  },
] as const;

const ORDERS = [
  {
    id: "o_ord00001",
    customer_id: CUSTOMERS[0].id,
    cart_id: null,
    status: "delivered",
    total_amount: 177,
    payment_utr: "UTR982341567890",
    payment_status: "verified",
    payment_method: "upi" as const,
    delivery_courier: "Dunzo",
    tracking_id: "DZ-7845123",
    shipment_status: "delivered",
    delivery_address: CUSTOMERS[0].address,
    created_at: daysAgo(3),
    updated_at: daysAgo(2.5),
  },
  {
    id: "o_ord00002",
    customer_id: CUSTOMERS[1].id,
    cart_id: null,
    status: "delivered",
    total_amount: 134,
    payment_utr: "UTR982341567891",
    payment_status: "verified",
    payment_method: "upi" as const,
    delivery_courier: "Shadowfax",
    tracking_id: "SF-9923411",
    shipment_status: "delivered",
    delivery_address: CUSTOMERS[1].address,
    created_at: daysAgo(2.8),
    updated_at: daysAgo(2),
  },
  {
    id: "o_ord00003",
    customer_id: CUSTOMERS[2].id,
    cart_id: null,
    status: "delivered",
    total_amount: 119,
    payment_utr: "UTR982341567892",
    payment_status: "verified",
    payment_method: "upi" as const,
    delivery_courier: "Dunzo",
    tracking_id: "DZ-7845199",
    shipment_status: "delivered",
    delivery_address: CUSTOMERS[2].address,
    created_at: daysAgo(2.2),
    updated_at: daysAgo(1.5),
  },
  {
    id: "o_ord00004",
    customer_id: CUSTOMERS[0].id,
    cart_id: null,
    status: "shipped",
    total_amount: 218,
    payment_utr: "UTR982341567893",
    payment_status: "verified",
    payment_method: "upi" as const,
    delivery_courier: "Delhivery",
    tracking_id: "DL-4412900",
    shipment_status: "in_transit",
    delivery_address: CUSTOMERS[0].address,
    created_at: daysAgo(1.5),
    updated_at: hoursAgo(6),
  },
  {
    id: "o_ord00005",
    customer_id: CUSTOMERS[1].id,
    cart_id: null,
    status: "shipped",
    total_amount: 99,
    payment_utr: "UTR982341567894",
    payment_status: "verified",
    payment_method: "upi" as const,
    delivery_courier: "Shadowfax",
    tracking_id: "SF-9923499",
    shipment_status: "in_transit",
    delivery_address: CUSTOMERS[1].address,
    created_at: daysAgo(1),
    updated_at: hoursAgo(4),
  },
  {
    id: "o_ord00006",
    customer_id: CUSTOMERS[2].id,
    cart_id: CARTS[2].id,
    status: "confirmed",
    total_amount: 119,
    payment_utr: "UTR982341567895",
    payment_status: "verified",
    payment_method: "upi" as const,
    delivery_courier: null,
    tracking_id: null,
    shipment_status: "awaiting_payment",
    delivery_address: CUSTOMERS[2].address,
    created_at: hoursAgo(12),
    updated_at: hoursAgo(10),
  },
  {
    id: "o_ord00007",
    customer_id: CUSTOMERS[0].id,
    cart_id: null,
    status: "payment_pending",
    total_amount: 183,
    payment_utr: null,
    payment_status: "pending",
    payment_method: "upi" as const,
    delivery_courier: null,
    tracking_id: null,
    shipment_status: "awaiting_payment",
    delivery_address: CUSTOMERS[0].address,
    notes: "Awaiting UPI confirmation",
    created_at: hoursAgo(6),
    updated_at: hoursAgo(6),
  },
  {
    id: "o_ord00008",
    customer_id: CUSTOMERS[1].id,
    cart_id: CARTS[1].id,
    status: "payment_pending",
    total_amount: 58,
    payment_utr: null,
    payment_status: "pending",
    payment_method: "upi" as const,
    delivery_courier: null,
    tracking_id: null,
    shipment_status: "awaiting_payment",
    delivery_address: CUSTOMERS[1].address,
    notes: "Awaiting UPI confirmation",
    created_at: hoursAgo(2),
    updated_at: hoursAgo(2),
  },
] as const;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function clearDemoData() {
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id")
    .eq("business_id", BUSINESS_ID);

  const conversationIds = (conversations ?? []).map((row) => row.id);

  if (conversationIds.length > 0) {
    await supabase
      .from("messages")
      .delete()
      .in("conversation_id", conversationIds);
  }

  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", BUSINESS_ID);

  const customerIds = (customers ?? []).map((row) => row.id);

  if (customerIds.length > 0) {
    const { data: carts } = await supabase
      .from("carts")
      .select("id")
      .in("customer_id", customerIds);

    const cartIds = (carts ?? []).map((row) => row.id);

    if (cartIds.length > 0) {
      await supabase.from("cart_items").delete().in("cart_id", cartIds);
      await supabase.from("carts").delete().in("id", cartIds);
    }
  }

  await supabase.from("orders").delete().eq("business_id", BUSINESS_ID);
  await supabase.from("conversations").delete().eq("business_id", BUSINESS_ID);
  await supabase.from("customers").delete().eq("business_id", BUSINESS_ID);
  await supabase.from("products").delete().eq("business_id", BUSINESS_ID);
}

async function seed() {
  console.log("🌱 Seeding S3K Commerce demo data…");

  const { error: businessError } = await supabase.from("businesses").upsert(
    BUSINESS,
    { onConflict: "slug" },
  );

  if (businessError) throw businessError;

  await clearDemoData();

  const { error: productsError } = await supabase.from("products").insert(
    PRODUCTS.map((product) => ({
      ...product,
      business_id: BUSINESS_ID,
      stock: 99,
      active: true,
    })),
  );

  if (productsError) throw productsError;
  console.log(`  ✓ ${PRODUCTS.length} products`);

  const { error: customersError } = await supabase.from("customers").insert(
    CUSTOMERS.map((customer) => ({
      ...customer,
      business_id: BUSINESS_ID,
      consent_given: true,
      created_at: daysAgo(3),
    })),
  );

  if (customersError) throw customersError;
  console.log(`  ✓ ${CUSTOMERS.length} customers`);

  const { error: conversationsError } = await supabase
    .from("conversations")
    .insert(
      CONVERSATIONS.map((conversation) => ({
        ...conversation,
        business_id: BUSINESS_ID,
      })),
    );

  if (conversationsError) throw conversationsError;
  console.log(`  ✓ ${CONVERSATIONS.length} conversations`);

  const { error: messagesError } = await supabase.from("messages").insert(
    MESSAGES.map((message) => ({
      id: message.id,
      conversation_id: message.conversation_id,
      sender_type: message.sender_type,
      content: message.content,
      created_at: message.created_at,
      intent: null,
      was_ai_drafted:
        "was_ai_drafted" in message ? Boolean(message.was_ai_drafted) : false,
    })),
  );

  if (messagesError) throw messagesError;
  console.log(`  ✓ ${MESSAGES.length} messages`);

  const { error: cartsError } = await supabase.from("carts").insert([...CARTS]);
  if (cartsError) throw cartsError;

  const { error: cartItemsError } = await supabase
    .from("cart_items")
    .insert([...CART_ITEMS]);

  if (cartItemsError) throw cartItemsError;
  console.log(`  ✓ ${CARTS.length} carts (${CART_ITEMS.length} items)`);

  const { error: ordersError } = await supabase.from("orders").insert(
    ORDERS.map((order) => ({
      id: order.id,
      business_id: BUSINESS_ID,
      customer_id: order.customer_id,
      cart_id: order.cart_id,
      status: order.status,
      total_amount: order.total_amount,
      delivery_fee: 40,
      payment_utr: order.payment_utr,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      delivery_courier: order.delivery_courier,
      tracking_id: order.tracking_id,
      shipment_status: order.shipment_status,
      delivery_address: order.delivery_address,
      notes: "notes" in order ? order.notes : null,
      created_at: order.created_at,
      updated_at: order.updated_at,
    })),
  );

  if (ordersError) throw ordersError;
  console.log(`  ✓ ${ORDERS.length} orders`);

  console.log("\n✅ S3K Commerce demo seed complete!");
  console.log(`   Business: ${BUSINESS.name} (${BUSINESS.slug})`);
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
