"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { LOGISTICS_SHIPMENT_STATUS_OPTIONS } from "@/lib/admin/order-utils";
import {
  canAdvanceLogisticsShipmentStatus,
  formatShipmentStatusLabel,
  getSelectableLogisticsShipmentStatuses,
  normalizeLogisticsShipmentStatus,
} from "@/lib/orders/order-lifecycle";
import type { ShipmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ShipmentStatusDropdownProps {
  orderId: string;
  currentStatus: ShipmentStatus;
  flashSuccess: boolean;
  onStatusChange: (orderId: string, status: ShipmentStatus) => Promise<void>;
}

const MENU_ITEM_HEIGHT = 36;
const MENU_PADDING = 8;

export function ShipmentStatusDropdown({
  orderId,
  currentStatus,
  flashSuccess,
  onStatusChange,
}: ShipmentStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayStatus = normalizeLogisticsShipmentStatus(currentStatus);
  const currentLabel = formatShipmentStatusLabel(displayStatus);
  const selectableStatuses = getSelectableLogisticsShipmentStatuses(
    currentStatus,
  );
  const selectableOptions = LOGISTICS_SHIPMENT_STATUS_OPTIONS.filter((option) =>
    selectableStatuses.includes(option.value),
  );
  const canAdvance = canAdvanceLogisticsShipmentStatus(currentStatus);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight =
      selectableOptions.length * MENU_ITEM_HEIGHT + MENU_PADDING;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight + 12;
    const width = Math.max(rect.width, 168);

    setMenuStyle({
      position: "fixed",
      top: openUpward ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
      width,
      zIndex: 9999,
    });
  }, [selectableOptions.length]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    function handleReposition() {
      updateMenuPosition();
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, updateMenuPosition]);

  async function handleSelect(status: ShipmentStatus) {
    if (status === displayStatus || updating) {
      setOpen(false);
      return;
    }

    setUpdating(true);
    try {
      await onStatusChange(orderId, status);
      setOpen(false);
    } catch {
      setOpen(false);
    } finally {
      setUpdating(false);
    }
  }

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Shipment status options"
            style={menuStyle}
            className="overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {selectableOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === displayStatus}
                disabled={updating}
                onClick={() => void handleSelect(option.value)}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50",
                  option.value === displayStatus
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-gray-700",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={updating || !canAdvance}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          canAdvance
            ? undefined
            : "Shipment is delivered — no further status changes."
        }
        onClick={() => {
          if (canAdvance) setOpen((value) => !value);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-50",
          flashSuccess && "bg-green-100",
        )}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-gray-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {menu}
    </>
  );
}
