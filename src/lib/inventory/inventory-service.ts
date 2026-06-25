import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type InventoryLineItem = {
  productId: string;
  quantity: number;
};

export type StockValidationIssue = {
  productId: string;
  productName: string;
  requested: number;
  available: number;
};

export type ProductStockRow = {
  stock: number;
  name_en: string;
};

export function mergeLineItemsByProduct(
  items: InventoryLineItem[],
): InventoryLineItem[] {
  const merged = new Map<string, number>();

  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }

  return Array.from(merged.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function validateStockLevels(
  items: InventoryLineItem[],
  stockByProduct: Map<string, ProductStockRow>,
): StockValidationIssue[] {
  const merged = mergeLineItemsByProduct(items);
  const issues: StockValidationIssue[] = [];

  for (const item of merged) {
    const product = stockByProduct.get(item.productId);
    const available = product?.stock ?? 0;

    if (item.quantity > available) {
      issues.push({
        productId: item.productId,
        productName: product?.name_en ?? "Item",
        requested: item.quantity,
        available,
      });
    }
  }

  return issues;
}

export function formatInsufficientStockMessage(
  issues: StockValidationIssue[],
): string {
  if (issues.length === 0) {
    return "Some items are no longer available in the requested quantity.";
  }

  if (issues.length === 1) {
    const issue = issues[0];
    if (issue.available === 0) {
      return `${issue.productName} is out of stock.`;
    }
    const unitLabel = issue.available === 1 ? "unit" : "units";
    return `Only ${issue.available} ${unitLabel} of ${issue.productName} available.`;
  }

  const lines = issues.map((issue) => {
    if (issue.available === 0) {
      return `${issue.productName}: out of stock`;
    }
    const unitLabel = issue.available === 1 ? "unit" : "units";
    return `${issue.productName}: only ${issue.available} ${unitLabel} available`;
  });

  return lines.join("\n");
}

export async function fetchProductStockLevels(
  supabase: SupabaseClient<Database>,
  productIds: string[],
): Promise<Map<string, ProductStockRow>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const stockByProduct = new Map<string, ProductStockRow>();

  if (uniqueIds.length === 0) {
    return stockByProduct;
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, stock, name_en")
    .in("id", uniqueIds);

  if (error) throw error;

  for (const row of data ?? []) {
    stockByProduct.set(row.id, {
      stock: Number(row.stock),
      name_en: row.name_en,
    });
  }

  return stockByProduct;
}

export async function validateOrderInventory(
  supabase: SupabaseClient<Database>,
  items: InventoryLineItem[],
): Promise<{ ok: true } | { ok: false; issues: StockValidationIssue[] }> {
  const merged = mergeLineItemsByProduct(items);
  const stockByProduct = await fetchProductStockLevels(
    supabase,
    merged.map((item) => item.productId),
  );
  const issues = validateStockLevels(merged, stockByProduct);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true };
}

export function isInsufficientStockError(message: string): boolean {
  return message.toLowerCase().includes("insufficient stock");
}

function isMissingInventoryRpcError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "PGRST202" ||
    message.includes("deduct_inventory_for_order") ||
    message.includes("could not find the function")
  );
}

async function deductInventoryDirect(
  supabase: SupabaseClient<Database>,
  orderId: string,
  items: InventoryLineItem[],
): Promise<void> {
  const merged = mergeLineItemsByProduct(items);

  for (const item of merged) {
    const { data: product, error: fetchError } = await supabase
      .from("products")
      .select("id, stock, name_en")
      .eq("id", item.productId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!product) {
      throw new Error(`Product not found: ${item.productId}`);
    }

    const available = Number(product.stock);
    if (item.quantity > available) {
      throw new Error(
        `Insufficient stock for ${product.name_en}: requested ${item.quantity}, available ${available}`,
      );
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({ stock: available - item.quantity })
      .eq("id", item.productId);

    if (updateError) throw updateError;

    logInventoryAudit({
      productName: product.name_en,
      previousStock: available,
      quantitySold: item.quantity,
      newStock: available - item.quantity,
      orderId,
    });
  }
}

export type InventoryDeductionResult =
  | { status: "deducted_via_rpc" }
  | { status: "deducted_via_fallback" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function deductInventoryForOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
  items: InventoryLineItem[],
): Promise<InventoryDeductionResult> {
  const merged = mergeLineItemsByProduct(items);
  const payload = merged.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
  }));

  const { error } = await supabase.rpc("deduct_inventory_for_order", {
    p_order_id: orderId,
    p_items: payload,
  });

  if (error) {
    if (isMissingInventoryRpcError(error)) {
      console.warn("[INVENTORY] RPC missing — using direct stock deduction fallback", {
        orderId,
        code: error.code,
        message: error.message,
      });

      try {
        await deductInventoryDirect(supabase, orderId, merged);
        console.log("[INVENTORY] Stock deducted via fallback for order", { orderId });
        return { status: "deducted_via_fallback" };
      } catch (fallbackError) {
        const reason =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Direct inventory deduction failed.";
        console.error("[INVENTORY] Fallback deduction failed — order kept, stock unchanged", {
          orderId,
          reason,
        });
        return { status: "skipped", reason };
      }
    }

    const reason = error.message ?? "Inventory RPC failed.";
    console.error("[INVENTORY] Deduction failed — order kept, stock unchanged", {
      orderId,
      code: error.code,
      reason,
    });
    return { status: "failed", reason };
  }

  const { data: auditRows, error: auditError } = await supabase
    .from("inventory_audit_log")
    .select("product_name, previous_stock, quantity_sold, new_stock, order_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (auditError) {
    console.warn("[INVENTORY] Audit log unavailable after RPC deduction", {
      orderId,
      message: auditError.message,
    });
  } else {
    for (const row of auditRows ?? []) {
      logInventoryAudit({
        productName: row.product_name,
        previousStock: row.previous_stock,
        quantitySold: row.quantity_sold,
        newStock: row.new_stock,
        orderId: row.order_id ?? orderId,
      });
    }
  }

  console.log("[INVENTORY] Stock deducted via RPC for order", {
    orderId,
    items: merged.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  });

  return { status: "deducted_via_rpc" };
}

export function logInventoryAudit(input: {
  productName: string;
  previousStock: number;
  quantitySold: number;
  newStock: number;
  orderId: string;
}): void {
  console.log("[INVENTORY AUDIT]", {
    product: input.productName,
    previousStock: input.previousStock,
    quantitySold: input.quantitySold,
    newStock: input.newStock,
    orderId: input.orderId,
  });
}
