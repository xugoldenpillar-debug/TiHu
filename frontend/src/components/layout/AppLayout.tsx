import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import {
  Compass,
  Image,
  Trophy,
  FlaskConical,
  History,
  GitCompare,
  PlusCircle,
  Key,
  Puzzle,
  FileText,
  Shield,
  Menu,
  X,
  LogOut,
  User,
  Sparkles,
  Zap,
} from "lucide-react";

interface NavGroup {
  title: string;
  enTitle: string;
  items: Array<{
    path: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }>;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, quota, activePath, navigate, openAuthModal, refreshSession, showToast } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const groups: NavGroup[] = [
    {
      title: "探索发现",
      enTitle: "DISCOVERY",
      items: [
        { path: "/explore", label: "探索题目", icon: <Compass className="w-4 h-4" /> },
        { path: "/gallery", label: "作品画廊", icon: <Image className="w-4 h-4" /> },
        { path: "/leaderboard", label: "模型榜单", icon: <Trophy className="w-4 h-4" /> },
      ],
    },
    {
      title: "我的工作台",
      enTitle: "WORKSPACE",
      items: [
        { path: "/studio", label: "实验室", icon: <FlaskConical className="w-4 h-4" />, badge: "BYOK" },
        { path: "/my-runs", label: "我的实验", icon: <History className="w-4 h-4" /> },
        { path: "/compare", label: "作品对比", icon: <GitCompare className="w-4 h-4" /> },
        { path: "/new-challenge", label: "创建题目", icon: <PlusCircle className="w-4 h-4" /> },
      ],
    },
    {
      title: "资产管理",
      enTitle: "ASSETS",
      items: [
        { path: "/connections", label: "API 连接", icon: <Key className="w-4 h-4" /> },
        { path: "/skills", label: "Skill 扩展", icon: <Puzzle className="w-4 h-4" /> },
        { path: "/prompts", label: "提示词库", icon: <FileText className="w-4 h-4" /> },
      ],
    },
  ];

  if (user?.role === "admin") {
    groups.push({
      title: "平台管理",
      enTitle: "ADMIN",
      items: [{ path: "/admin", label: "管理中心", icon: <Shield className="w-4 h-4" /> }],
    });
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/session", { method: "DELETE" });
      await refreshSession();
      showToast("已安全退出登录", "info");
      navigate("/explore");
    } catch {
      showToast("退出登录失败，请刷新重试", "error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#080b11] text-slate-100 selection:bg-sky-500/30">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full h-16 border-b border-slate-800/80 bg-[#0c101a]/85 backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div
            onClick={() => navigate("/explore")}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 p-[1px] shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-all">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center overflow-hidden">
                <img src="/art/pelican.svg" alt="TiHu" className="w-6 h-6 object-contain" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-gradient-brand">TiHu</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Arena
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">BYOK 模型实验场</p>
            </div>
          </div>
        </div>

        {/* Right Action & User Profile */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {quota && (
                <div
                  onClick={() => navigate("/my-runs")}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 cursor-pointer transition-all"
                  title={`并发中: ${quota.active}/${quota.active_limit} | 24h剩余额度: ${quota.daily_remaining}/${quota.daily_limit}`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    额度: <strong className="text-slate-100">{quota.daily_remaining}</strong> / {quota.daily_limit}
                  </span>
                  {quota.active > 0 && (
                    <span className="flex items-center gap-1 text-sky-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                      {quota.active} 运行中
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={() => navigate("/studio")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-sky-500/20 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>进入实验室</span>
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="flex flex-col items-end text-right">
                  <span className="text-xs font-semibold text-slate-200">{user.username}</span>
                  <span className="text-[10px] text-slate-400">{user.role === "admin" ? "管理员" : "创作者"}</span>
                </div>
                <button
                  onClick={handleLogout}
                  title="退出登录"
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuthModal("login")}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-all cursor-pointer"
              >
                登录
              </button>
              <button
                onClick={() => openAuthModal("register")}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-400 rounded-xl shadow-lg shadow-sky-500/25 transition-all cursor-pointer"
              >
                注册体验
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Body with Sidebar */}
      <div className="flex-1 flex w-full max-w-[1720px] mx-auto">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-800/80 bg-[#090d16]/60 p-4 gap-6 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">{group.title}</span>
                <span className="text-[9px] font-mono text-slate-500">{group.enTitle}</span>
              </div>
              {group.items.map((item) => {
                const active = activePath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-sky-500/15 to-indigo-500/15 text-sky-300 border border-sky-500/30 shadow-sm"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={active ? "text-sky-400" : "text-slate-500"}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="mt-auto p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-slate-800/80 text-xs text-slate-400 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>pi 0.85.1 编码智能体</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              gVisor 独立沙箱隔离执行，严格加密的 BYOK 凭据代理，生成真实前端交互作品。
            </p>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed inset-y-0 left-0 w-72 bg-slate-950 border-r border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="font-bold text-slate-200">导航菜单</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {groups.map((group) => (
                <div key={group.title} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-400 px-3">{group.title}</span>
                  {group.items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                        activePath === item.path
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                          : "text-slate-400 hover:text-white hover:bg-slate-900"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page Content Viewport */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 flex flex-col">{children}</main>
      </div>
    </div>
  );
}
