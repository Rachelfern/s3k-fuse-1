"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  PackageX,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Returns", href: "/admin/returns", icon: PackageX },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Chats", href: "/admin/chats", icon: MessageSquare },
  { label: "Shipments", href: "/admin/shipments", icon: Truck },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/orders": "Orders",
  "/admin/returns": "Returns",
  "/admin/products": "Products",
  "/admin/chats": "Chats",
  "/admin/shipments": "Shipments",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(`${prefix}/`)) return title;
  }

  return "Admin";
}

interface AdminShellProps {
  children: React.ReactNode;
  email: string;
}

export function AdminShell({ children, email }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = getPageTitle(pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMobileNav}
          aria-label="Close navigation menu"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-56 max-w-[85vw] flex-col border-r border-gray-800 bg-gray-900 transition-transform duration-200 ease-out lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-gray-800 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--whatsapp-primary)] text-[10px] font-bold text-white">
                S3K
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">
                  S3K Commerce
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  Admin
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeMobileNav}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white lg:hidden"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                onClick={closeMobileNav}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-r-2 border-[var(--whatsapp-primary)] bg-[var(--whatsapp-primary)]/10 text-[var(--whatsapp-accent)]"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white",
                )}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-800 px-4 py-4">
          <p className="truncate text-xs text-gray-400">{email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 lg:ml-56">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="truncate text-lg font-semibold text-gray-900">
              {pageTitle}
            </h1>
          </div>
          <p className="hidden max-w-[45%] truncate text-sm text-gray-500 sm:block">
            Admin User · {email}
          </p>
        </header>
        <main className="min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
