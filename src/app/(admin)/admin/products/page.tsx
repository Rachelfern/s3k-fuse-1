"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import type { Product } from "@/lib/types";
import type { ProductFilter } from "@/lib/admin/products-list";
import { AddProductModal } from "@/components/admin/add-product-modal";
import { EditProductModal } from "@/components/admin/edit-product-modal";
import { ConnectionErrorBanner } from "@/components/ui/connection-error-banner";
import { ProductGridSkeleton } from "@/components/ui/product-grid-skeleton";
import { StockStatusBadge } from "@/components/ui/stock-status-badge";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product/product-image";
import { formatINR } from "@/lib/admin/order-utils";
import { cn } from "@/lib/utils";

const FILTER_TABS: { label: string; value: ProductFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

async function fetchProductsFromApi(filter: ProductFilter): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filter !== "all") {
    params.set("filter", filter);
  }

  const query = params.toString();
  const url = `/api/admin/products${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (process.env.NODE_ENV === "development") {
      console.error("[ADMIN PRODUCTS] fetch failed", {
        url,
        status: response.status,
        body,
      });
    }
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  const data = (await response.json()) as { products: Product[] };
  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN PRODUCTS]", { filter, rows: data.products.length });
  }
  return data.products;
}

export default function AdminProductsPage() {
  const [activeTab, setActiveTab] = useState<ProductFilter>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [addToastVisible, setAddToastVisible] = useState(false);
  const [inventoryToastVisible, setInventoryToastVisible] = useState(false);

  const loadProducts = useCallback(async (filter: ProductFilter) => {
    setLoading(true);
    try {
      const rows = await fetchProductsFromApi(filter);
      setProducts(rows);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load products.";
      if (process.env.NODE_ENV === "development") {
        console.error("[ADMIN PRODUCTS] load failed:", loadError);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts(activeTab);
  }, [activeTab, loadProducts]);

  return (
    <div className="admin-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Products</h2>
          <p className="mt-1 text-sm text-gray-500">
            Menu items available in S3K Commerce
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="w-full bg-green-500 text-white hover:bg-green-600 sm:w-auto"
        >
          <Plus className="size-4" />
          Add Product
        </Button>
      </div>

      {error ? (
        <ConnectionErrorBanner
          message={`Failed to load products: ${error}`}
          onRetry={() => void loadProducts(activeTab)}
        />
      ) : null}

      <div className="flex flex-wrap gap-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              activeTab === tab.value
                ? "bg-green-500 text-white"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-400">
        {loading ? "Loading…" : `${products.length} products found`}
      </p>

      {loading ? (
        <ProductGridSkeleton count={5} />
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    No products found.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          productId={product.id}
                          name={product.name_en}
                          imageUrl={product.image_url}
                          size="xs"
                          className="rounded-lg"
                        />
                        <div>
                          <p className="font-medium text-gray-900">
                            {product.name_en}
                          </p>
                          {product.name_hi ? (
                            <p className="text-xs text-gray-400">
                              {product.name_hi}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 capitalize text-gray-700">
                      {product.category}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-900">
                      {formatINR(product.price)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium tabular-nums text-gray-900">
                          {product.stock}
                        </span>
                        <StockStatusBadge stock={product.stock} />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          product.active
                            ? "bg-green-50 text-green-700 ring-green-100"
                            : "bg-gray-100 text-gray-600 ring-gray-100",
                        )}
                      >
                        {product.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingProduct(product)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <AddProductModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setAddToastVisible(true);
          void loadProducts(activeTab);
        }}
      />

      <EditProductModal
        product={editingProduct}
        open={editingProduct !== null}
        onClose={() => setEditingProduct(null)}
        onSuccess={() => {
          setInventoryToastVisible(true);
          void loadProducts(activeTab);
        }}
      />

      <Toast
        message="Product added successfully"
        visible={addToastVisible}
        onDismiss={() => setAddToastVisible(false)}
      />

      <Toast
        message="Inventory updated successfully"
        visible={inventoryToastVisible}
        onDismiss={() => setInventoryToastVisible(false)}
      />
    </div>
  );
}
