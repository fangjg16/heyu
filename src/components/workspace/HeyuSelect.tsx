import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeyuSelectOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: readonly HeyuSelectOption<T>[] | HeyuSelectOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
  "aria-label"?: string;
  prefix?: string;
  size?: "sm" | "md";
  className?: string;
};

export function HeyuSelect<T extends string>({
  value,
  options,
  disabled,
  onChange,
  "aria-label": ariaLabel,
  prefix,
  size = "md",
  className,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    minWidth: number;
    openUp: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const compact = size === "sm";
  const current = options.find((o) => o.value === value);
  const label = current?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuH = 10 + options.length * (compact ? 32 : 36);
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const openUp = spaceBelow < menuH && r.top > spaceBelow;
      setPos({
        top: openUp ? r.top - 6 : r.bottom + 6,
        left: r.left,
        minWidth: Math.max(r.width, compact ? 148 : 176),
        openUp,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length, compact]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? prefix}
            style={{
              top: pos.top,
              left: pos.left,
              minWidth: pos.minWidth,
              transform: pos.openUp ? "translateY(-100%)" : undefined,
            }}
            className="fixed z-[80] rounded-[12px] border border-[rgba(78,66,57,0.12)] bg-[#FFFCFA] p-1 shadow-[0_12px_32px_rgba(78,66,57,0.14)]"
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    if (opt.value !== value) onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 text-left transition-colors",
                    compact ? "h-8 text-[12px]" : "h-9 text-[13px]",
                    selected
                      ? "bg-[hsl(var(--wine-muted))] font-medium text-[hsl(var(--wine))]"
                      : "text-[hsl(var(--warm-charcoal))] hover:bg-[rgba(78,66,57,0.06)]",
                  )}
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ?? prefix}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex appearance-none items-center text-left outline-none transition-colors disabled:cursor-not-allowed",
          prefix
            ? cn("heyu-chip gap-1.5 border-0", compact && "heyu-chip-sm")
            : cn(
                "h-8 gap-1 rounded-[9px] border border-[rgba(78,66,57,0.14)] bg-white px-2.5",
                compact && "h-7 rounded-lg px-2 text-[11px]",
              ),
          open && "ring-1 ring-[hsl(var(--wine)/0.28)]",
          disabled && "opacity-70",
        )}
      >
        {prefix ? (
          <span className="text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
            {prefix}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 truncate font-medium text-[hsl(var(--warm-charcoal))]",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {label}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-[#969E9A] transition-transform duration-150",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
