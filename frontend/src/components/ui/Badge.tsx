import React from "react";

export function Badge({
  children,
  variant = "default",
  size = "md",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "brand" | "success" | "warning" | "danger" | "purple" | "neutral";
  size?: "sm" | "md";
  className?: string;
}) {
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";
  const variantClasses = {
    default: "bg-slate-100 text-slate-700 border-slate-200/80",
    brand: "bg-sky-50 text-sky-700 border-sky-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    neutral: "bg-slate-50 text-slate-600 border-slate-200",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md border select-none ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
}
