import React from "react";

export function Card({
  children,
  className = "",
  hover = false,
  glow = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl ${
        hover ? "card-hover cursor-pointer" : ""
      } ${glow ? "border-sky-500/30 shadow-[0_0_25px_rgba(56,189,248,0.1)]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

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

export function Dialog({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full ${maxWidth} bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden backdrop-blur-2xl animate-in zoom-in-95 duration-200`}
      >
        {title && (
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
