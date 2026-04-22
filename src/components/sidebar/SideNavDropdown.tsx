"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";

type DropdownChild = {
  label: string;
  href: string;
};

type SideNavDropdownProps = {
  label: string;
  icon: React.ComponentType<any>;
  children: DropdownChild[];
};

export const SideNavDropdown = ({ label, icon: Icon, children }: SideNavDropdownProps) => {
  const pathname = usePathname();
  const isAnyChildSelected = children.some((child) => pathname.startsWith(child.href));
  const [isOpen, setIsOpen] = useState(isAnyChildSelected);

  useEffect(() => {
    if (isAnyChildSelected) setIsOpen(true);
  }, [isAnyChildSelected]);

  return (
    <div>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center text-base px-4 py-1 rounded m-1 space-x-3 cursor-pointer ${
          isAnyChildSelected
            ? "font-medium text-darkBlue bg-gray-200"
            : "text-gray-500 hover:bg-gray-200"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{label}</span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {isOpen && (
        <div className="ml-6">
          {children.map((child) => {
            const isSelected = pathname.startsWith(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                prefetch={true}
                className={`flex items-center text-sm px-4 py-1 rounded m-1 ${
                  isSelected
                    ? "font-medium text-darkBlue bg-gray-200"
                    : "text-gray-500 hover:bg-gray-200"
                }`}
              >
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
