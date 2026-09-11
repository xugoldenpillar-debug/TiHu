import React, { useEffect, useState, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { Challenge, PageResult } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  Search,
  Sparkles,
  Plus,
  ArrowRight,
  ShieldCheck,
  Zap,
  Terminal,
  Play,
  Flame,
  Star,
  ExternalLink,
} from "lucide-react";

export function ExplorePage() {
  const { navigate, showToast } = useApp();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await api<PageResult<Challenge>>("/challenges?limit=50");
        if (mounted) setChallenges(res.items || []);
      } catch (err) {
        if (mounted) showToast(errorText(err), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    challenges.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ["all", ...Array.from(set)];
  }, [challenges]);

  const filteredChallenges = useMemo(() => {
    return challenges.filter((c) => {
      const matchCat = selectedCategory === "all" || c.category === selectedCategory;
      const matchSearch =
        !search.trim() ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [challenges, selectedCategory, search]);

  const getChallengeArt = (c: Challenge) => {
    if (c.art) return c.art;
    const title = c.title.toLowerCase();
    if (title.includes("pelican") || title.includes("鹈鹕")) return "/art/challenge-pelican.svg";
    if (title.includes("polar") || title.includes("熊") || title.includes("秦始皇"))
      return "/challenge-qinshihuang.png";
    if (title.includes("clock") || title.includes("时钟") || title.includes("闹钟"))
      return "/art/challenge-clock.svg";
    if (title.includes("world") || title.includes("生态") || title.includes("世界"))
      return "/art/challenge-ecosystem.svg";
    return "/art/challenge-pelican.svg";
  };

  return (
    <div className="flex flex-col gap-10 max-w-7xl mx-auto w-full pb-20 animate-in fade-in duration-300">
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden p-8 sm:p-12 lg:p-14 border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/60 to-sky-50/30 shadow-md backdrop-blur-xl">
        {/* Ambient background glows */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gradient-to-bl from-blue-200/40 via-sky-100/30 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-gradient-to-tr from-amber-200/30 via-orange-100/20 to-transparent blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 border border-slate-200 shadow-xs text-slate-800 text-xs font-semibold w-fit">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              <span>BYOK 极客模型竞技场 · v0.85 智能体内核</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 leading-[1.15]">
              让大模型在真实沙箱中
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500">
                写出惊艳的交互杰作
              </span>
            </h1>

            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              选择挑战，接入你的专属 API Key。智能体将在纯隔离的 gVisor 沙箱中逐行生成多文件源码、自主推理排错并完成可视化渲染。完全私下预览，满意后再公开发布打榜。
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-3">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate("/studio")}
                icon={<Sparkles className="w-4 h-4 text-amber-300" />}
                className="shadow-sm hover:shadow-md"
              >
                开启智能体实验
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate("/gallery")}
                icon={<Play className="w-4 h-4 text-slate-500" />}
              >
                巡礼精选作品
              </Button>

              <Button
                variant="ghost"
                size="lg"
                onClick={() => navigate("/new-challenge")}
                icon={<Plus className="w-4 h-4" />}
              >
                设计新题目
              </Button>
            </div>

            {/* Micro Feature Pills */}
            <div className="grid grid-cols-3 gap-3 pt-6 border-t border-slate-200/60 mt-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">gVisor 内核级隔离</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Terminal className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-medium">实时事件流追踪</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="font-medium">多模型双盲对抗</span>
              </div>
            </div>
          </div>

          {/* Hero Right Visual: Interactive Sandbox Preview Card */}
          <div className="relative w-full max-w-sm lg:max-w-md shrink-0">
            <div className="relative rounded-2xl glass-panel p-5 shadow-xl border border-white/60 animate-float">
              {/* Header mockup */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <span className="ml-2 text-[11px] font-mono font-bold text-slate-600">
                    sandbox: pelican_bicycle.html
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/60">
                  LIVE 运行中
                </span>
              </div>

              {/* Art Illustration preview */}
              <div className="relative aspect-4/3 rounded-xl bg-gradient-to-br from-slate-100 via-sky-50 to-slate-200/50 my-3 overflow-hidden flex items-center justify-center p-4">
                <img
                  src="/art/pelican.svg"
                  alt="Pelican Hero"
                  className="w-4/5 h-4/5 object-contain filter drop-shadow-md transform hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-md rounded-lg p-2 border border-slate-200/60 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-slate-600">2048x1536 SVG DOM</span>
                  <span className="font-bold text-blue-600">98.5% 能力分</span>
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center justify-between pt-2 text-xs">
                <span className="text-slate-500 font-medium">执行耗时 32.4s · 12 次调用</span>
                <button
                  onClick={() => navigate("/challenge/90d6e987d6e443deacdfdcc95bef0a38")}
                  className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>立即应战</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 shadow-xs"
              }`}
            >
              {cat === "all" ? "全部题目分类" : cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索题目关键词或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/90 border border-slate-200/90 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 shadow-xs transition-all"
          />
        </div>
      </div>

      {/* Challenge Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-72 rounded-3xl bg-white/70 border border-slate-200/80 animate-pulse"
            />
          ))}
        </div>
      ) : filteredChallenges.length === 0 ? (
        <div className="p-16 rounded-3xl bg-white/80 border border-slate-200 text-center flex flex-col items-center gap-3 shadow-xs">
          <Sparkles className="w-10 h-10 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base">未找到符合条件的挑战题目</h3>
          <p className="text-xs text-slate-500">试着换一个搜索关键词或分类筛选</p>
          <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSelectedCategory("all"); }}>
            重置筛选条件
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredChallenges.map((c) => {
            const artSrc = getChallengeArt(c);
            return (
              <Card
                key={c.id}
                hover
                onClick={() => navigate(`/challenge/${c.id}`)}
                className="group flex flex-col overflow-hidden bg-white/90 hover:bg-white border-slate-200/90 hover:border-slate-300/90 shadow-xs hover:shadow-lg transition-all duration-300 rounded-3xl"
              >
                {/* Visual Art Header */}
                <div className="relative aspect-16/10 bg-gradient-to-br from-slate-50 via-sky-50/40 to-slate-100 overflow-hidden flex items-center justify-center p-6 border-b border-slate-100">
                  <img
                    src={artSrc}
                    alt={c.title}
                    className="w-full h-full object-contain filter drop-shadow-sm transform group-hover:scale-108 transition-transform duration-500"
                    loading="lazy"
                  />

                  {/* Badges Overlay */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    {c.category && (
                      <span className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md text-[11px] font-bold text-slate-800 shadow-xs border border-white/60">
                        {c.category}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-md text-[10px] font-mono text-white font-semibold">
                      v{c.current_version}
                    </span>
                  </div>

                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold shadow-md">
                      <span>查看详情</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-6 flex flex-col gap-3 flex-1 justify-between">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-extrabold text-slate-900 text-lg group-hover:text-blue-600 transition-colors line-clamp-1">
                      {c.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {c.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100/90 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px]">ID: {c.id.slice(0, 8)}...</span>
                    <span className="font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-1 transition-colors">
                      进入挑战 &rarr;
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
