"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentScreenshotUploadProps = {
  orderId: string;
  customerId: string;
  compact?: boolean;
  instruction?: string;
  onUploaded?: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

export function PaymentScreenshotUpload({
  orderId,
  customerId,
  compact = false,
  instruction = "Upload your payment screenshot after completing the UPI payment.",
  onUploaded,
  onUploadingChange,
}: PaymentScreenshotUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  function setUploadingState(value: boolean) {
    setUploading(value);
    onUploadingChange?.(value);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadingState(true);

    try {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("customerId", customerId);

      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/payment-screenshot`,
        { method: "POST", body: formData },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Upload failed");
      }

      const data = (await response.json()) as { url?: string };
      setUploaded(true);
      onUploaded?.(data.url ?? "");
    } catch (uploadError) {
      setPreviewUrl(null);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload screenshot.",
      );
    } finally {
      setUploadingState(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-[#128c7e]/40 bg-white/80 p-3",
        compact && "p-2",
        uploaded && "border-green-200 bg-green-50/50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={uploading || uploaded}
        onChange={(event) => void handleFileChange(event)}
      />

      {uploaded ? (
        <div className="flex items-start gap-2 text-green-700">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Screenshot uploaded successfully</p>
            <p className="mt-1 text-xs text-green-700/80">
              Our team will verify your payment shortly.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-700">{instruction}</p>
      )}

      {previewUrl ? (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Payment screenshot preview"
            className="max-h-48 w-full rounded-lg border border-gray-100 object-contain"
          />
        </div>
      ) : null}

      {!uploaded ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            uploading
              ? "border-gray-200 bg-gray-50 text-gray-500"
              : "border-[#128c7e]/40 bg-white text-[#075e54] hover:bg-[#ecfdf5]",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Uploading screenshot…
            </>
          ) : (
            <>
              <ImagePlus className="size-4" />
              {previewUrl ? "Replace screenshot" : "Upload payment screenshot"}
            </>
          )}
        </button>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
