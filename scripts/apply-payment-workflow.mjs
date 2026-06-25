/**
 * Applies all payment verification / rejection / retry migrations in order.
 *
 * Requires SUPABASE_DB_URL (or DATABASE_URL) in .env.local — Postgres URI from
 * Supabase → Settings → Database → Connection string → URI
 *
 * Usage:
 *   node --import tsx scripts/apply-payment-workflow.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env") });

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  console.error(
    "Missing SUPABASE_DB_URL (or DATABASE_URL) in .env.local.\n" +
      "Add your Postgres connection string from Supabase → Settings → Database → Connection string → URI.",
  );
  process.exit(1);
}

const MIGRATIONS = [
  "20250623130000_upi_verification_pending.sql",
  "20250623140000_ai_ops_payment_screenshots.sql",
  "20250624120000_payment_verification_rejection.sql",
];

const REQUIRED_COLUMNS = [
  "payment_status",
  "payment_method",
  "payment_screenshot_url",
  "payment_screenshot_path",
  "payment_screenshot_uploaded_at",
  "payment_rejection_reason",
  "payment_rejected_at",
  "payment_verified_at",
  "payment_retry_submitted_at",
];

const REQUIRED_STATUSES = [
  "pending",
  "verified",
  "failed",
  "verification_pending",
  "rejected",
  "retry_submitted",
];

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected. Applying payment workflow migrations…\n");

  for (const file of MIGRATIONS) {
    const path = resolve(root, "supabase/migrations", file);
    const sql = readFileSync(path, "utf8");
    console.log(`→ ${file}`);
    await client.query(sql);
  }

  // Reload PostgREST schema cache (Supabase API layer)
  await client.query("NOTIFY pgrst, 'reload schema';");

  const { rows: columns } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [REQUIRED_COLUMNS],
  );

  const found = new Set(columns.map((row) => row.column_name));
  const missing = REQUIRED_COLUMNS.filter((name) => !found.has(name));

  const { rows: constraintRows } = await client.query(
    `SELECT pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public'
       AND rel.relname = 'orders'
       AND con.conname = 'orders_payment_status_check'`,
  );

  const constraintDef = constraintRows[0]?.definition ?? "";
  const missingStatuses = REQUIRED_STATUSES.filter(
    (status) => !constraintDef.includes(`'${status}'`),
  );

  console.log("\nVerification:");
  console.log(`  Columns found: ${found.size}/${REQUIRED_COLUMNS.length}`);
  if (missing.length > 0) {
    console.error(`  Missing columns: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (missingStatuses.length > 0) {
    console.error(
      `  payment_status CHECK missing values: ${missingStatuses.join(", ")}`,
    );
    process.exit(1);
  }

  console.log("  payment_status CHECK: ok");
  console.log("\nAll payment workflow migrations applied and verified.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}
