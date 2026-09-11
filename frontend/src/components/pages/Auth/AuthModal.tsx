import React, { useState } from "react";
import { useApp } from "../../../context/AppContext";
import { Dialog } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Button } from "../../ui/Button";
import { api, errorText } from "../../../api/client";
import { LogIn, UserPlus, KeyRound } from "lucide-react";

export function AuthModal() {
  const { authModalMode, closeAuthModal, refreshSession, showToast, config } = useApp();
  const [tab, setTab] = useState<"login" | "register" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (!authModalMode) return null;

  const currentTab = tab || authModalMode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (currentTab === "login") {
        await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        showToast("登录成功！欢迎回来", "success");
        await refreshSession();
        closeAuthModal();
      } else if (currentTab === "register") {
        if (!config?.registration) {
          throw new Error("当前系统暂未开放公开注册");
        }
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, username, password }),
        });
        showToast("注册成功！请查收验证邮件以完成激活", "success");
        await refreshSession();
        closeAuthModal();
      } else if (currentTab === "forgot") {
        await api("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        showToast("若邮箱存在，重置密码邮件已发送，请查收", "info");
        closeAuthModal();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={Boolean(authModalMode)} onClose={closeAuthModal} maxWidth="max-w-md">
      <div className="flex flex-col gap-5">
        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentTab === "login" ? "bg-slate-800 text-sky-300 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            登录账号
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentTab === "register" ? "bg-slate-800 text-sky-300 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            注册新用户
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("forgot");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentTab === "forgot" ? "bg-slate-800 text-sky-300 shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            找回密码
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="电子邮箱"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {currentTab === "register" && (
            <Input
              label="创作者昵称 (用户名)"
              type="text"
              required
              placeholder="letters, digits, 3-24 chars"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}

          {currentTab !== "forgot" && (
            <Input
              label="登录密码"
              type="password"
              required
              placeholder="至少 8 位强密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          <Button
            type="submit"
            loading={loading}
            variant="primary"
            className="w-full mt-2"
            icon={
              currentTab === "login" ? (
                <LogIn className="w-4 h-4" />
              ) : currentTab === "register" ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )
            }
          >
            {currentTab === "login" ? "立即登录" : currentTab === "register" ? "注册并开始" : "发送重置邮件"}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
