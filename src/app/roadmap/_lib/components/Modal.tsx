"use client";

import { useEffect } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  contentClassName?: string;
};

const SIZE_CLASS = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  contentClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        className={cn(
          "relative w-full bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]",
          SIZE_CLASS[size],
        )}
      >
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 ml-4 cursor-pointer"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className={cn("flex-1 min-h-0 overflow-y-auto p-4", contentClassName)}>{children}</div>

        {footer && <div className="border-t p-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
