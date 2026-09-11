import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { AdminUser, AdminChallenge, AdminPrompt } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Shield, Users, BookOpen, AlertOctagon, Ban, CheckCircle2 } from "lucide-react";

export function AdminPage() {
  const { user, showToast, navigate } = useApp();
  const [tab, setTab] = useState<"users" | "challenges" | "prompts">("users");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") {
      setLoading(false);
      return;
    }

    let mounted = true;
    async function loadAdminData() {
      try {
        setLoading(true);
        if (tab === "users") {
          const res = await api<AdminUser[]>("/admin/users");
          if (mounted) setUsers(res || []);
        } else if (tab === "challenges") {
          const res = await api<AdminChallenge[]>("/admin/challenges");
          if (mounted) setChallenges(res || []);
        } else if (tab === "prompts") {
          const res = await api<AdminPrompt[]>("/admin/prompts");
          if (mounted) setPrompts(res || []);
        }
      } catch (err) {
        if (mounted) showToast(errorText(err), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAdminData();
    return () => {
      mounted = false;
    };
  }, [user, tab, showToast]);

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center p-16 max-w-md mx-auto text-center gap-4">
        <Shield className="w-12 h-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-100">无权限访问管理中心</h2>
        <p className="text-xs text-slate-400">此页面仅向平台管理员开放。</p>
        <Button onClick={() => navigate("/explore")}>返回主页</Button>
      </div>
    );
  }

  const handleToggleSuspend = async (u: AdminUser) => {
    const action = u.suspended ? "unsuspend" : "suspend";
    if (!confirm(`确定要${u.suspended ? "解封" : "封禁"}用户 ${u.username} 吗？`)) return;
    try {
      await api(`/admin/users/${u.id}/${action}`, { method: "POST" });
      showToast(`用户已成功${u.suspended ? "解封" : "封禁"}`, "success");
      setUsers((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, suspended: !u.suspended } : item))
      );
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  const handleArchiveChallenge = async (c: AdminChallenge) => {
    if (!confirm(`确定要归档题目《${c.title}》吗？`)) return;
    try {
      await api(`/admin/challenges/${c.id}/archive`, { method: "POST" });
      showToast("题目已归档", "info");
      setChallenges((prev) =>
        prev.map((item) => (item.id === c.id ? { ...item, archived: true } : item))
      );
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">平台安全与治理中心 (Admin)</h1>
          <p className="text-xs text-slate-400">管理全站用户账号状态、题目归档与内容合规审查。</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === "users"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>创作者用户 ({users.length})</span>
        </button>

        <button
          onClick={() => setTab("challenges")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === "challenges"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>挑战题目管理 ({challenges.length})</span>
        </button>

        <button
          onClick={() => setTab("prompts")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === "prompts"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          <span>提示词审计 ({prompts.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-900/40 border border-slate-800 animate-shimmer" />
          ))}
        </div>
      ) : tab === "users" ? (
        <Card className="p-4 bg-slate-900/80 divide-y divide-slate-800">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-3.5 px-2">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-200">{u.username}</span>
                  <Badge variant={u.role === "admin" ? "brand" : "neutral"} size="sm">
                    {u.role}
                  </Badge>
                  {u.suspended && <Badge variant="danger" size="sm">已封禁</Badge>}
                  {u.verified ? (
                    <span className="text-[10px] text-emerald-400 font-medium">已验证</span>
                  ) : (
                    <span className="text-[10px] text-amber-400 font-medium">未验证</span>
                  )}
                </div>
                <span className="text-xs text-slate-500 font-mono">{u.email}</span>
              </div>

              {u.role !== "admin" && (
                <Button
                  size="sm"
                  variant={u.suspended ? "primary" : "danger"}
                  onClick={() => handleToggleSuspend(u)}
                >
                  {u.suspended ? "解封账号" : "暂停/封禁"}
                </Button>
              )}
            </div>
          ))}
        </Card>
      ) : tab === "challenges" ? (
        <Card className="p-4 bg-slate-900/80 divide-y divide-slate-800">
          {challenges.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3.5 px-2">
              <div className="flex flex-col gap-0.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-200">{c.title}</span>
                  <Badge variant="brand" size="sm">v{c.current_version}</Badge>
                  {c.archived && <Badge variant="warning" size="sm">已归档</Badge>}
                </div>
                <span className="text-xs text-slate-400 line-clamp-1">{c.description}</span>
              </div>

              {!c.archived && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleArchiveChallenge(c)}
                >
                  归档此题
                </Button>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-4 bg-slate-900/80 divide-y divide-slate-800">
          {prompts.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 py-3.5 px-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-200">{p.name}</span>
                <span className="text-xs text-slate-500">作者: {p.author}</span>
              </div>
              <pre className="p-2.5 rounded-lg bg-slate-950 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                {p.body}
              </pre>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
