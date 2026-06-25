import { NextResponse } from "next/server";
import {
  createProduct,
  validateCreateProductInput,
  type CreateProductInput,
} from "@/lib/admin/create-product";
import {
  fetchAdminProducts,
  type ProductFilter,
} from "@/lib/admin/products-list";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

const VALID_FILTERS = new Set<ProductFilter>(["all", "active", "inactive"]);

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user } = await requireAdminUser();

  if (!user) {
    if (process.env.NODE_ENV === "development") {
      console.error("[admin/products] unauthorized", {
        url: request.url,
      });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawFilter = searchParams.get("filter") ?? "all";
  const filter = VALID_FILTERS.has(rawFilter as ProductFilter)
    ? (rawFilter as ProductFilter)
    : "all";

  try {
    const products = await fetchAdminProducts(filter);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("[admin/products] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateProductInput;
  try {
    body = (await request.json()) as CreateProductInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validationError = validateCreateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const product = await createProduct(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("[admin/products] create failed:", error);

    const message =
      error instanceof Error ? error.message : diagnoseSupabaseError(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
