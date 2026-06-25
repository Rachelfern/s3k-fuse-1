"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRODUCT_CATEGORIES } from "@/lib/admin/product-categories";
import type { CreateProductInput } from "@/lib/admin/create-product";
import {
  ImagePreview,
  ToggleField,
} from "@/components/admin/product-form-shared";

type FormState = {
  name_en: string;
  description: string;
  category: string;
  price: string;
  image_url: string;
  stock: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name_en: "",
  description: "",
  category: "",
  price: "",
  image_url: "",
  stock: "0",
  active: true,
};

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

async function createProductViaApi(
  input: CreateProductInput,
): Promise<void> {
  const response = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
}

export function AddProductModal({
  open,
  onClose,
  onSuccess,
}: AddProductModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setForm(EMPTY_FORM);
    setError(null);
    setSubmitting(false);
  }, [open]);

  if (!open) return null;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const price = Number.parseFloat(form.price);
    const stock = Number.parseInt(form.stock, 10);

    const payload: CreateProductInput = {
      name_en: form.name_en,
      description: form.description || null,
      category: form.category,
      price,
      image_url: form.image_url,
      stock: Number.isFinite(stock) ? stock : Number.NaN,
      active: form.active,
    };

    setSubmitting(true);
    setError(null);

    try {
      await createProductViaApi(payload);
      onSuccess();
      onClose();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create product.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-product-title"
        className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-50 mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="add-product-title" className="text-lg font-semibold text-gray-900">
              Add Product
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Create a new item for the store catalog.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="product-name" className="text-sm font-medium text-gray-700">
                Product Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="product-name"
                value={form.name_en}
                onChange={(event) => updateField("name_en", event.target.value)}
                placeholder="e.g. Alphonso Mango"
                disabled={submitting}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="product-description"
                className="text-sm font-medium text-gray-700"
              >
                Description
              </label>
              <textarea
                id="product-description"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Short product description"
                disabled={submitting}
                rows={3}
                className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="product-category"
                  className="text-sm font-medium text-gray-700"
                >
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  id="product-category"
                  value={form.category}
                  onChange={(event) => updateField("category", event.target.value)}
                  disabled={submitting}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select category</option>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="product-price" className="text-sm font-medium text-gray-700">
                  Price (₹) <span className="text-red-500">*</span>
                </label>
                <Input
                  id="product-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => updateField("price", event.target.value)}
                  placeholder="0.00"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="product-image-url"
                className="text-sm font-medium text-gray-700"
              >
                Product Image URL <span className="text-red-500">*</span>
              </label>
              <Input
                id="product-image-url"
                type="url"
                value={form.image_url}
                onChange={(event) => updateField("image_url", event.target.value)}
                placeholder="https://images.unsplash.com/..."
                disabled={submitting}
              />
            </div>

            <ImagePreview url={form.image_url} />

            <div className="space-y-1.5">
              <label htmlFor="product-stock" className="text-sm font-medium text-gray-700">
                Stock Quantity
              </label>
              <Input
                id="product-stock"
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={(event) => updateField("stock", event.target.value)}
                disabled={submitting}
              />
            </div>

            <ToggleField
              label="Available For Sale"
              description="Inactive products are hidden from customers."
              checked={form.active}
              onChange={(checked) => updateField("active", checked)}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Product"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
