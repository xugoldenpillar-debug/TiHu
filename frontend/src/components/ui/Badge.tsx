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
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  const variantClasses = {
    default: "bg-slate-800/90 text-slate-300 border-slate-700/60",
    brand: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    danger: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    neutral: "bg-slate-900/80 text-slate-400 border-slate-800",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full border backdrop-blur-sm select-none ${sizeClasses} ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
}
