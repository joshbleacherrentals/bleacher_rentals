"use client";

import type { ReactNode, Ref } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePageWidth } from "../hooks/usePageWidth";
import { sideLinksShown } from "../utils/sideLinkRoom";

/**
 * The invoice page's frame: the page's column of 1040 px, and, when the page's box has room for
 * them, a Previous Task button on its left and a Next Task button on its right, outside the
 * column, sticky. They repeat the buttons at the bottom of the page (the accessible ones), so the
 * rails are hidden from assistive technology and their links are out of the tab order.
 * docs/specs/accountant-collections-22-side-task-buttons.md §1 and §3.
 */

const SIDE_LINK =
  "sticky top-6 flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-darkBlue bg-white px-3 text-[15px] font-medium text-darkBlue shadow-[0_1px_3px_rgba(15,42,68,0.12)]";

/** A link, or without a destination a dimmed stand-in that cannot be followed. */
function SideLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) {
    return (
      <span aria-disabled="true" className={`${SIDE_LINK} cursor-not-allowed opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} tabIndex={-1} className={SIDE_LINK}>
      {children}
    </Link>
  );
}

const RAIL = "w-[168px] shrink-0 pt-12";

/** The frame without its measuring: the rails are drawn when `rails` is true. */
export function InvoicePageFrameView({
  rails,
  previousHref,
  nextHref,
  frameRef,
  children,
}: {
  rails: boolean;
  previousHref: string | null;
  nextHref: string | null;
  frameRef: Ref<HTMLDivElement> | null;
  children: ReactNode;
}) {
  return (
    <div ref={frameRef} className="w-full">
      <div className="flex items-stretch justify-center gap-4">
        {rails && (
          <div aria-hidden="true" className={RAIL}>
            <SideLink href={previousHref}>
              <ArrowLeft className="size-[18px]" aria-hidden />
              Previous Task
            </SideLink>
          </div>
        )}
        <div className="min-w-0 flex-[0_1_1040px] px-8 pb-14 pt-2">{children}</div>
        {rails && (
          <div aria-hidden="true" className={RAIL}>
            <SideLink href={nextHref}>
              Next Task
              <ArrowRight className="size-[18px]" aria-hidden />
            </SideLink>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Puts the page in the frame. `sideLinks` is false where the view has no Previous / Next Task
 * (Customer view). Nothing is drawn beside the column until the page's box is measured.
 */
export function InvoicePageFrame({
  sideLinks,
  previousHref,
  nextHref,
  children,
}: {
  sideLinks: boolean;
  previousHref: string | null;
  nextHref: string | null;
  children: ReactNode;
}) {
  const { ref, width } = usePageWidth();
  return (
    <InvoicePageFrameView
      rails={sideLinksShown(sideLinks, width)}
      previousHref={previousHref}
      nextHref={nextHref}
      frameRef={ref}
    >
      {children}
    </InvoicePageFrameView>
  );
}
