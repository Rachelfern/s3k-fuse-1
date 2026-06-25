/**
 * Applies supabase/migrations/20250623120000_dpdp_consent.sql
 *
 * Requires SUPABASE_DB_URL in .env.local (Settings → Database → Connection string → URI)
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

const sql = readFileSync(
  resolve(root, "supabase/migrations/20250623120000_dpdp_consent.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected. Applying DPDP consent migration…");
  await client.query(sql);
  console.log("Migration applied successfully.");
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}
