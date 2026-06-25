import { NextResponse } from "next/server";
import type { ProductFormInput } from "@/lib/admin/product-form";
import { validateProductFormInput } from "@/lib/admin/product-form";
import { updateProduct } from "@/lib/admin/update-product";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

interface RouteContext {
  params: Promise<{ productId: string }>;
}

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await context.params;

  if (!productId?.trim()) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  let body: ProductFormInput;
  try {
    body = (await request.json()) as ProductFormInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validationError = validateProductFormInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const product = await updateProduct(productId, body);
    return NextResponse.json({ product });
  } catch (error) {
    console.error("[admin/products/[productId]] update failed:", {
      productId,
      error,
    });

    const message =
      error instanceof Error ? error.message : diagnoseSupabaseError(error);

    const status = message === "Product not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
