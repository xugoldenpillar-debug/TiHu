import React from "react";

export function Input({
  label,
  error,
  helper,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  helper?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-semibold text-slate-300 tracking-wide">{label}</label>}
      <input
        className={`w-full px-3.5 py-2.5 bg-slate-950/60 border rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/60 transition-all ${
          error ? "border-rose-500/70 focus:border-rose-500" : "border-slate-800 hover:border-slate-700"
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
      {helper && !error && <p className="text-xs text-slate-400">{helper}</p>}
    </div>
  );
}

export function Textarea({
  label,
  error,
  helper,
  className = "",
  rows = 4,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  helper?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-semibold text-slate-300 tracking-wide">{label}</label>}
      <textarea
        rows={rows}
        className={`w-full px-3.5 py-2.5 bg-slate-950/60 border rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/60 transition-all font-mono text-xs ${
          error ? "border-rose-500/70 focus:border-rose-500" : "border-slate-800 hover:border-slate-700"
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
      {helper && !error && <p className="text-xs text-slate-400">{helper}</p>}
    </div>
  );
}

export function Select({
  label,
  error,
  helper,
  options,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  helper?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-semibold text-slate-300 tracking-wide">{label}</label>}
      <select
        className={`w-full px-3.5 py-2.5 bg-slate-900 border rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/60 transition-all ${
          error ? "border-rose-500/70 focus:border-rose-500" : "border-slate-800 hover:border-slate-700"
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100 py-1">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
      {helper && !error && <p className="text-xs text-slate-400">{helper}</p>}
    </div>
  );
}
