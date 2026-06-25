"use client";

import Link from "next/link";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { mockBusiness } from "@/lib/mock/business";
import { STORE_INITIALS } from "@/lib/brand";

export function ChatHeader() {
  return (
    <header className="flex h-[52px] w-full shrink-0 items-center gap-2.5 bg-[#075e54] px-3 shadow-md md:px-4 lg:px-6 safe-top">
      <Link
        href="/"
        className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10"
        aria-label="Back to home"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-[11px] font-bold text-white">
        {STORE_INITIALS}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-tight text-white">
          {mockBusiness.name}
        </p>
        <p className="text-[12px] leading-tight text-white/70">Online</p>
      </div>

      <button
        type="button"
        className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/10"
        aria-label="More options"
      >
        <MoreVertical className="size-5" />
      </button>
    </header>
  );
}
