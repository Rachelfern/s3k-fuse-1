import {
  formatInsufficientStockMessage,
  mergeLineItemsByProduct,
  validateOrderInventory,
} from "@/lib/inventory/inventory-service";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service-client";

type ValidateRequestBody = {
  items?: {
    productId?: string;
    quantity?: number;
  }[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ValidateRequestBody;
    const items = (body.items ?? [])
      .filter(
        (item): item is { productId: string; quantity: number } =>
          Boolean(item.productId) &&
          typeof item.quantity === "number" &&
          item.quantity > 0,
      )
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));

    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one cart item is required." },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const validation = await validateOrderInventory(
      supabase,
      mergeLineItemsByProduct(items),
    );

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: formatInsufficientStockMessage(validation.issues),
          issues: validation.issues,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[INVENTORY] Validation failed:", error);
    return NextResponse.json(
      { error: "Failed to validate inventory." },
      { status: 500 },
    );
  }
}
