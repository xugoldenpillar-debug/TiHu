import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "glow";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5 font-medium",
    md: "px-4 py-2 text-sm rounded-xl gap-2 font-medium",
    lg: "px-5 py-2.5 text-sm rounded-xl gap-2 font-semibold",
  }[size];

  const variantClasses = {
    primary:
      "bg-slate-900 hover:bg-slate-800 text-white shadow-xs active:scale-[0.98] border border-slate-900",
    secondary:
      "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-xs active:scale-[0.98]",
    outline:
      "bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-300 active:scale-[0.98]",
    ghost:
      "bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 active:scale-[0.98]",
    danger:
      "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-[0.98]",
    glow:
      "bg-sky-600 hover:bg-sky-500 text-white shadow-xs active:scale-[0.98] border border-sky-600",
  }[variant];

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center cursor-pointer transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : icon}
      {children}
    </button>
  );
}
