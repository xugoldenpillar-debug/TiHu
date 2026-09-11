import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User, Quota, AppConfig, Session } from "../types";
import { api, fetchConfig, fetchSession, errorText } from "../api/client";

export interface ToastItem {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
}

interface AppContextType {
  user: User | null;
  quota: Quota | null;
  config: AppConfig | null;
  voteEligibleAt: number | null;
  loading: boolean;
  activePath: string;
  path: string;
  navigate: (path: string) => void;
  refreshSession: () => Promise<void>;
  showToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
  openAuthModal: (mode?: "login" | "register") => void;
  authModalMode: "login" | "register" | null;
  closeAuthModal: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [voteEligibleAt, setVoteEligibleAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePath, setActivePath] = useState(window.location.pathname || "/explore");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);

  const showToast = useCallback((message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const sess = await fetchSession();
      setUser(sess.user);
      setQuota(sess.quota);
      setVoteEligibleAt(sess.vote_eligible_at);
    } catch {
      setUser(null);
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const [cfg, sess] = await Promise.all([fetchConfig(), fetchSession()]);
        if (!mounted) return;
        setConfig(cfg);
        setUser(sess.user);
        setQuota(sess.quota);
        setVoteEligibleAt(sess.vote_eligible_at);
      } catch (err) {
        if (!mounted) return;
        showToast(errorText(err), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();

    const onPopState = () => setActivePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => {
      mounted = false;
      window.removeEventListener("popstate", onPopState);
    };
  }, [showToast]);

  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
      setActivePath(path);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const openAuthModal = useCallback((mode: "login" | "register" = "login") => {
    setAuthModalMode(mode);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalMode(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        quota,
        config,
        voteEligibleAt,
        loading,
        activePath,
        path: activePath,
        navigate,
        refreshSession,
        showToast,
        openAuthModal,
        authModalMode,
        closeAuthModal,
      }}
    >
      {children}
      {/* Global Toast Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => {
          const borderClass =
            toast.type === "error"
              ? "border-rose-200 text-rose-800 bg-rose-50"
              : toast.type === "success"
                ? "border-emerald-200 text-emerald-800 bg-emerald-50"
                : toast.type === "warning"
                  ? "border-amber-200 text-amber-800 bg-amber-50"
                  : "border-slate-200 text-slate-800 bg-white";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto px-4 py-2.5 rounded-xl border shadow-lg text-xs font-medium transition-all duration-200 ${borderClass}`}
            >
              {toast.message}
            </div>
          );
        })}
      </div>
    </AppContext.Provider>
  );
}
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
