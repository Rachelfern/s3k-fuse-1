# Supabase Setup — Vaarta by S3K

Complete setup for an **empty** Supabase project. Nothing has been executed against your project yet — run these steps manually.

## 1. Run schema

Open **SQL Editor** in Supabase and paste the full contents of:

- `supabase/schema.sql`

Or, if using Supabase CLI:

```bash
supabase db push
```

### Order state machine migration (required after pulling latest code)

If checkout fails with `orders_shipment_status_check`, your database still has the old shipment statuses. Apply:

**Option A — SQL Editor:** paste and run `supabase/migrations/20250623100000_order_state_machine.sql`

**Option B — CLI script:** add your Postgres URI to `.env.local` as `SUPABASE_DB_URL`, then:

```bash
npm run db:migrate:order-state-machine
```

Get the URI from **Settings → Database → Connection string → URI**.

### Payment method column (required for COD vs prepaid rules)

If admin dashboard, checkout, or `/my-data` export fails on `payment_method`, run:

**Option A — SQL Editor:** `supabase/migrations/20250623110000_payment_method.sql`

**Option B — CLI script:**

```bash
npm run db:migrate:payment-method
```

The app also falls back to inferring payment method from `payment_utr` / `notes` when the column is missing, but you should apply the migration for correct COD/UPI/card behaviour.

## 2. Run seed data

In the same SQL Editor, paste and run:

- `supabase/seed.sql`

Or with Supabase CLI:

```bash
supabase db seed
```

## 3. Verify tables

Table Editor should show:

| Table | Rows (after seed) |
|-------|-------------------|
| `businesses` | 1 |
| `products` | 5 |
| `customers` | 5 |
| `conversations` | 1 |
| `messages` | 2 |
| `carts` | 3 |
| `cart_items` | 3 |
| `orders` | 10 |

## 4. Verify realtime

**Database → Replication** should list `messages` and `orders` under `supabase_realtime`.  
The schema SQL adds them automatically via `ALTER PUBLICATION`.

## 5. Create an admin user (Authentication)

The app redirects unauthenticated users to `/admin/login`.

1. Go to **Authentication → Users → Add user**
2. Email + password of your choice
3. No special metadata required today (any authenticated user passes the admin layout check)

## 6. Environment variables

Copy `.env.example` → `.env.local` and fill in from **Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL` — public, safe for the browser
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, safe for the browser (RLS-protected)
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**; used by API routes and server-side admin data fetches. Never use a `NEXT_PUBLIC_` prefix for this key.

Admin pages load data through authenticated API routes (`/api/admin/*`) that use the server-side service role. Realtime subscriptions use the anon key via the browser client.

## 7. Expected admin dashboard metrics (after seed)

| Metric | Value |
|--------|-------|
| Total Orders | 10 |
| Revenue | ₹2,835.00 |
| Pending Payments | 3 |
| Confirmed Orders | 7 |

Recent Orders table shows the 5 newest orders (`o_ord00006` through `o_ord00010` by default).

## 8. Test flows

| Flow | How to test |
|------|-------------|
| **Admin dashboard** | Sign in at `/admin/login` → `/admin/dashboard` |
| **Realtime** | Update an order row in Table Editor → cards flash "Updated just now" |
| **Customer chat** | `/chat` → connect with phone `+919876543210` → send messages |
| **Track order AI** | In chat, tap "Track Order" or type "track my order" → returns `o_ord00006` for Rahul Sharma |

## Seed UUIDs (must match `src/lib/demo.ts`)

| Entity | UUID |
|--------|------|
| Vaarta Demo Store | `a1000000-0000-4000-8000-000000000001` |
| Rajma Chawal | `a2000000-0000-4000-8000-000000000001` |
| Dal Fry | `a2000000-0000-4000-8000-000000000002` |
| Paneer Butter Masala | `a2000000-0000-4000-8000-000000000003` |
| Butter Naan | `a2000000-0000-4000-8000-000000000004` |
| Mango Lassi | `a2000000-0000-4000-8000-000000000005` |
| Demo customer (Rahul) | `b1000000-0000-4000-8000-000000000001` |

## Known gaps (app vs schema)

- **Checkout** still stores orders in React state only (`ORD-…` IDs). Seed orders power the admin dashboard and AI track-order, not the checkout flow.
- **`/admin/login` page** is referenced by the layout but may still need to be implemented.
- **Service role in browser** is used for admin reads — acceptable for hackathon demo, not for production.
