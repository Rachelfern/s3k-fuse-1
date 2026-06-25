/**
 * Applies supabase/migrations/20250623150000_return_requests_support.sql
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
    "Missing SUPABASE_DB_URL (or DATABASE_URL) in .env.local.",
  );
  process.exit(1);
}

const sql = readFileSync(
  resolve(root, "supabase/migrations/20250623150000_return_requests_support.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected. Applying return requests & support tickets migration…");
  await client.query(sql);
  console.log("Migration applied successfully.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
} finally {
  await client.end();
}
