"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-green-500" : "bg-gray-200",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-5 translate-y-0.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function ImagePreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const trimmed = url.trim();

  useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  if (!trimmed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
        Enter an image URL to preview
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 text-center text-sm text-amber-700">
        Could not load image preview. Check the URL before saving.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={trimmed}
        alt="Product preview"
        className="mx-auto h-40 w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
