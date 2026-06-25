"use client";

import Link from "next/link";
import { ArrowLeft, MoreVertical } from "lucide-react";
import {
  ADMIN_BRAND,
  STORE_INITIALS,
  STORE_NAME,
} from "@/lib/brand";
import { cn } from "@/lib/utils";

export { STORE_NAME, STORE_INITIALS, ADMIN_BRAND };

interface CustomerShellProps {
  backHref: string;
  backLabel: string;
  subtitle: string;
  children: React.ReactNode;
  quickActions?: React.ReactNode;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  navigationBlocked?: boolean;
}

export function CustomerShell({
  backHref,
  backLabel,
  subtitle,
  children,
  quickActions,
  footer,
  headerExtra,
  navigationBlocked = false,
}: CustomerShellProps) {
  return (
    <div className="chat-shell flex w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-[var(--whatsapp-bg)]">
      <header className="flex h-[52px] w-full shrink-0 items-center gap-2.5 bg-[#075e54] px-3 shadow-md md:px-4 lg:px-6 safe-top">
        {navigationBlocked ? (
          <button
            type="button"
            disabled
            className="rounded-full p-1.5 text-white/40"
            aria-label={backLabel}
            title="Please wait while your screenshot uploads"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Link
            href={backHref}
            className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10"
            aria-label={backLabel}
          >
            <ArrowLeft className="size-5" />
          </Link>
        )}

        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-[11px] font-bold text-white">
          {STORE_INITIALS}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-tight text-white">
            {STORE_NAME}
          </p>
          <p className="text-[12px] leading-tight text-white/70">{subtitle}</p>
        </div>

        <div className="flex items-center">
          {headerExtra}
          <button
            type="button"
            className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/10"
            aria-label="More options"
          >
            <MoreVertical className="size-5" />
          </button>
        </div>
      </header>

      <div className="whatsapp-pattern min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2 md:px-4 lg:px-6">
        {children}
      </div>

      {quickActions ? (
        <div className="shrink-0 border-t border-black/5 bg-[var(--whatsapp-bg)]/80 px-2 py-1.5">
          <div className="flex flex-wrap gap-1">{quickActions}</div>
        </div>
      ) : null}

      {footer ? (
        <div className="shrink-0 border-t border-black/5 bg-[#f0f0f0] px-2 py-1.5 safe-bottom">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[18px_18px_18px_4px] bg-white px-2.5 py-1.5 shadow-sm min-w-0 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CustomerSectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function CustomerQuickLink({
  href,
  children,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap rounded-full border border-[#128c7e]/40 bg-white px-2.5 py-0.5 text-[11px] font-medium leading-tight text-[#075e54] shadow-sm transition-colors hover:bg-[#ecfdf5]",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
    >
      {children}
    </Link>
  );
}

export function CustomerPrimaryButton({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center justify-center rounded-full bg-[#128c7e] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#075e54] disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CustomerPrimaryLink({
  href,
  children,
  className,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        className={cn(
          "flex h-10 w-full items-center justify-center rounded-full bg-[#128c7e] text-sm font-semibold text-white opacity-50",
          className,
        )}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex h-10 w-full items-center justify-center rounded-full bg-[#128c7e] text-sm font-semibold text-white transition-colors hover:bg-[#075e54]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export const customerFieldClassName =
  "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#128c7e] focus:outline-none focus:ring-1 focus:ring-[#128c7e]";
