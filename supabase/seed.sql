-- S3K Commerce — demo seed data
-- Business/product UUIDs must match src/lib/demo.ts
-- Run after supabase/schema.sql on an empty project
--
-- Seed UUID map (hex-only, valid RFC 4122):
--   businesses     a1000000-0000-4000-8000-000000000001
--   products       a2000000-0000-4000-8000-00000000000*
--   customers      b1000000-0000-4000-8000-00000000000*
--   conversations  d1000000-0000-4000-8000-00000000000*
--   messages       e1000000-0000-4000-8000-00000000000*
--   carts          f1000000-0000-4000-8000-00000000000*
--   cart_items     a3000000-0000-4000-8000-00000000000*
--   orders         o_ord00001 … o_ord00010 (TEXT ids)

-- ---------------------------------------------------------------------------
-- Business
-- ---------------------------------------------------------------------------

INSERT INTO businesses (id, name, slug) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'S3K Commerce', 'vaarta-demo')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Products (matches src/lib/mock/products.ts)
-- ---------------------------------------------------------------------------

INSERT INTO products (id, business_id, name_en, name_hi, description, category, price, stock, active, image_url) VALUES
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Alphonso Mango',
    'हापुस आम',
    'Sweet seasonal mangoes',
    'Fruits',
    34.00,
    99,
    TRUE,
    'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'Fresh Banana',
    'केला',
    'Ripe bananas',
    'Fruits',
    25.00,
    99,
    TRUE,
    'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400'
  ),
  (
    'a2000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    'Farm Fresh Milk 1L',
    'दूध',
    'Fresh dairy milk',
    'Dairy',
    75.00,
    99,
    TRUE,
    'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'
  ),
  (
    'a2000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    'Broccoli 1pc',
    'ब्रोकली',
    'Fresh green broccoli',
    'Vegetables',
    29.00,
    99,
    TRUE,
    'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400'
  ),
  (
    'a2000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000001',
    'Tomatoes 500g',
    'टमाटर',
    'Farm-fresh tomatoes',
    'Vegetables',
    18.00,
    99,
    TRUE,
    'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400'
  ),
  (
    'a2000000-0000-4000-8000-000000000006',
    'a1000000-0000-4000-8000-000000000001',
    'Chicken Breast 500g',
    'चिकन ब्रेस्ट',
    'Lean boneless chicken breast — high protein',
    'Meat',
    100.00,
    99,
    TRUE,
    'https://images.unsplash.com/photo-1604503468506-440b70325a3a?w=400'
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

INSERT INTO customers (
  id, business_id, phone, name, address, order_count, total_spent, consent_given, created_at
) VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    '+919876543210',
    'Rahul Sharma',
    '14, Koramangala 5th Block, Bengaluru 560095',
    2,
    1090.00,
    TRUE,
    NOW() - INTERVAL '5 days'
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    '+919123456789',
    'Priya Mehta',
    'B-302, Hiranandani Gardens, Powai, Mumbai 400076',
    1,
    215.00,
    TRUE,
    NOW() - INTERVAL '4 days'
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000001',
    '+919988776655',
    'Arjun Patel',
    '22, Satellite Road, Ahmedabad 380015',
    2,
    770.00,
    TRUE,
    NOW() - INTERVAL '3 days'
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000001',
    '+919811223344',
    'Sneha Reddy',
    '8, Jubilee Hills, Hyderabad 500033',
    2,
    500.00,
    TRUE,
    NOW() - INTERVAL '2 days'
  ),
  (
    'b1000000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000001',
    '+919900112233',
    'Vikram Singh',
    '45, Connaught Place, New Delhi 110001',
    2,
    460.00,
    TRUE,
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Conversations + messages (chat demo)
-- ---------------------------------------------------------------------------

INSERT INTO conversations (id, business_id, customer_id, unread_count, last_message_at, created_at) VALUES
  (
    'd1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    0,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, conversation_id, sender_type, content, intent, was_ai_drafted, created_at) VALUES
  (
    'e1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'customer',
    'Hi, I want to order Rajma Chawal',
    NULL,
    FALSE,
    NOW() - INTERVAL '2 hours 5 minutes'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'd1000000-0000-4000-8000-000000000001',
    'admin',
    'Namaste Rahul! Rajma Chawal is ₹120. Would you like to add Butter Naan too?',
    'general',
    TRUE,
    NOW() - INTERVAL '2 hours'
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Carts (schema-ready; checkout not yet persisted from the app)
-- ---------------------------------------------------------------------------

INSERT INTO carts (id, customer_id, conversation_id, status, created_at, updated_at) VALUES
  (
    'f1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'converted',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    NULL,
    'converted',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000003',
    NULL,
    'active',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO cart_items (id, cart_id, product_id, quantity, price_snapshot) VALUES
  (
    'a3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    2,
    120.00
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000004',
    2,
    40.00
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000005',
    1,
    60.00
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Orders (10 rows — powers admin dashboard metrics + AI track-order)
-- Expected dashboard metrics after seed:
--   Total Orders: 10
--   Revenue: ₹2,835.00 (excludes cancelled o_ord00007)
--   Pending Payments: 3
--   Confirmed Orders: 7
-- ---------------------------------------------------------------------------

INSERT INTO orders (
  id, business_id, customer_id, cart_id, status, total_amount, delivery_fee,
  payment_utr, payment_status, payment_method, delivery_courier, tracking_id, shipment_status,
  delivery_address, notes, created_at, updated_at
) VALUES
  (
    'o_ord00001',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'delivered',
    940.00,
    40,
    'UTR982341567890',
    'verified',
    'upi',
    'Dunzo',
    'DZ-7845123',
    'delivered',
    '14, Koramangala 5th Block, Bengaluru 560095',
    'Leave at reception',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days 18 hours'
  ),
  (
    'o_ord00002',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    'shipped',
    215.00,
    40,
    'UTR982341567891',
    'verified',
    'upi',
    'Shadowfax',
    'SF-9923411',
    'in_transit',
    'B-302, Hiranandani Gardens, Powai, Mumbai 400076',
    NULL,
    NOW() - INTERVAL '2 days 6 hours',
    NOW() - INTERVAL '1 day'
  ),
  (
    'o_ord00003',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000003',
    NULL,
    'confirmed',
    320.00,
    40,
    'UTR982341567892',
    'verified',
    'upi',
    NULL,
    NULL,
    'awaiting_payment',
    '22, Satellite Road, Ahmedabad 380015',
    NULL,
    NOW() - INTERVAL '1 day 12 hours',
    NOW() - INTERVAL '1 day 10 hours'
  ),
  (
    'o_ord00004',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000004',
    NULL,
    'packed',
    180.00,
    40,
    'UTR982341567893',
    'verified',
    'upi',
    'Delhivery',
    'DL-4412900',
    'packed',
    '8, Jubilee Hills, Hyderabad 500033',
    'Call before delivery',
    NOW() - INTERVAL '20 hours',
    NOW() - INTERVAL '6 hours'
  ),
  (
    'o_ord00005',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000005',
    NULL,
    'payment_pending',
    260.00,
    40,
    NULL,
    'pending',
    'upi',
    NULL,
    NULL,
    'awaiting_payment',
    '45, Connaught Place, New Delhi 110001',
    'Awaiting UPI confirmation',
    NOW() - INTERVAL '8 hours',
    NOW() - INTERVAL '8 hours'
  ),
  (
    'o_ord00006',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    NULL,
    'new',
    150.00,
    40,
    NULL,
    'pending',
    'upi',
    NULL,
    NULL,
    'awaiting_payment',
    '14, Koramangala 5th Block, Bengaluru 560095',
    NULL,
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '3 hours'
  ),
  (
    'o_ord00007',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    NULL,
    'cancelled',
    100.00,
    40,
    NULL,
    'failed',
    'upi',
    NULL,
    NULL,
    'awaiting_payment',
    'B-302, Hiranandani Gardens, Powai, Mumbai 400076',
    'Customer cancelled',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'o_ord00008',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000003',
    NULL,
    'delivered',
    450.00,
    40,
    'UTR982341567894',
    'verified',
    'upi',
    'Dunzo',
    'DZ-7845999',
    'delivered',
    '22, Satellite Road, Ahmedabad 380015',
    NULL,
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '3 days 20 hours'
  ),
  (
    'o_ord00009',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000004',
    NULL,
    'shipped',
    320.00,
    40,
    'UTR982341567895',
    'verified',
    'upi',
    'Shadowfax',
    'SF-9923499',
    'in_transit',
    '8, Jubilee Hills, Hyderabad 500033',
    NULL,
    NOW() - INTERVAL '18 hours',
    NOW() - INTERVAL '4 hours'
  ),
  (
    'o_ord00010',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000005',
    NULL,
    'confirmed',
    200.00,
    40,
    NULL,
    'pending',
    'upi',
    NULL,
    NULL,
    'awaiting_payment',
    '45, Connaught Place, New Delhi 110001',
    'Payment verification in progress',
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '30 minutes'
  )
ON CONFLICT (id) DO NOTHING;
