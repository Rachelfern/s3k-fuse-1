"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { S3KLogo } from "@/components/brand/s3k-logo";
import { mockBusiness } from "@/lib/mock/business";
import { cn } from "@/lib/utils";

interface CommerceShellProps {
  title: string;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  className?: string;
}

export function CommerceShell({
  title,
  backHref,
  backLabel,
  children,
  footer,
  headerExtra,
  className,
}: CommerceShellProps) {
  return (
    <div
      className={cn(
        "flex min-h-[100dvh] w-full flex-col bg-[var(--whatsapp-bg)]",
        className
      )}
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-[var(--whatsapp-header)] px-3 py-2.5 shadow-md safe-top">
        <Link
          href={backHref}
          className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10"
          aria-label={backLabel}
        >
          <ArrowLeft className="size-5" />
        </Link>

        <S3KLogo size="sm" className="ring-white/20" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="truncate text-xs text-white/70">
            {mockBusiness.name}
          </p>
        </div>

        {headerExtra}
      </header>

      <main className="whatsapp-pattern flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-border/50 bg-[var(--whatsapp-in)] px-3 py-4 safe-bottom">
            {footer}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function CommerceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-white p-4 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CommerceSectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className
      )}
    >
      {children}
    </h2>
  );
}
