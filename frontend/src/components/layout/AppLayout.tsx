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
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 selection:bg-sky-100 selection:text-sky-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full h-14 border-b border-slate-200/90 bg-white/90 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div
            onClick={() => navigate("/explore")}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden p-0.5">
              <img src="/art/pelican.svg" alt="TiHu" className="w-full h-full object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-base text-slate-900">TiHu</span>
              <span className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                Arena
              </span>
            </div>
          </div>
        </div>

        {/* Right Action & User Profile */}
        <div className="flex items-center gap-2.5">
          {user ? (
            <>
              {quota && (
                <div
                  onClick={() => navigate("/my-runs")}
                  className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:border-slate-300 cursor-pointer transition-all"
                  title={`并发: ${quota.active}/${quota.active_limit} | 24h额度: ${quota.daily_remaining}/${quota.daily_limit}`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    额度: <strong className="text-slate-800">{quota.daily_remaining}</strong> / {quota.daily_limit}
                  </span>
                  {quota.active > 0 && (
                    <span className="flex items-center gap-1 text-sky-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                      {quota.active} 运行中
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={() => navigate("/studio")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>进入实验室</span>
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="flex flex-col items-end text-right">
                  <span className="text-xs font-semibold text-slate-800">{user.username}</span>
                  <span className="text-[10px] text-slate-500">{user.role === "admin" ? "管理员" : "创作者"}</span>
                </div>
                <button
                  onClick={handleLogout}
                  title="退出登录"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openAuthModal("login")}
                className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              >
                登录
              </button>
              <button
                onClick={() => openAuthModal("register")}
                className="px-3 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all cursor-pointer"
              >
                注册体验
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Body with Sidebar */}
      <div className="flex-1 flex w-full max-w-[1600px] mx-auto">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-slate-200/80 bg-slate-50/50 p-3.5 gap-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2.5 py-1">
                {group.title}
              </span>
              {group.items.map((item) => {
                const active = activePath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                      active
                        ? "bg-white text-slate-900 border border-slate-200/90 shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={active ? "text-slate-900" : "text-slate-400"}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="mt-auto p-3 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-500 flex flex-col gap-1.5 shadow-xs">
            <div className="flex items-center gap-1.5 text-slate-800 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>pi 0.85.1 智能体</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              gVisor 独立沙箱隔离执行，严格加密的 BYOK 凭据代理。
            </p>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-6 overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="font-semibold text-slate-900 text-sm">导航菜单</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {groups.map((group) => (
                <div key={group.title} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-400 px-2.5">{group.title}</span>
                  {group.items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                        activePath === item.path
                          ? "bg-slate-100 text-slate-900 font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
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
