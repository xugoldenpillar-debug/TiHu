import React, { useEffect, useState, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { Challenge, PageResult } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Search, Sparkles, Plus, ArrowRight, Layers, Flame, Compass } from "lucide-react";

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
    if (title.includes("polar") || title.includes("熊") || title.includes("秦始皇")) return "/art/challenge-polar-bear.svg";
    if (title.includes("clock") || title.includes("时钟")) return "/art/challenge-clock.svg";
    if (title.includes("world") || title.includes("生态") || title.includes("世界")) return "/art/challenge-ecosystem.svg";
    return "/art/challenge-pelican.svg";
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden p-8 sm:p-10 lg:p-12 border border-slate-800/80 bg-gradient-to-br from-slate-900 via-[#0c1222] to-indigo-950/40 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              <span>智能体极限评测场 · BYOK 模式</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-100 leading-tight">
              探索真实高难挑战，
              <br />
              <span className="text-gradient-brand">检验你的大模型实力</span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              选择经典或社区前沿题目，连接自己的 API Key，在独立的 gVisor 沙箱中运行 pi 0.85.1 编码 Agent。
              实时观察生成与动效，一键发布作品参与全网天梯对决。
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="glow"
                size="lg"
                onClick={() => navigate("/studio")}
                icon={<Sparkles className="w-4 h-4" />}
              >
                立即开始实验
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate("/gallery")}
                icon={<Flame className="w-4 h-4 text-amber-400" />}
              >
                浏览作品画廊
              </Button>
            </div>
          </div>

          {/* Hero Art Showcase */}
          <div className="hidden lg:flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 backdrop-blur-md">
            <img
              src="/art/challenge-pelican.svg"
              alt="Pelican on Bicycle"
              className="w-48 h-48 object-contain drop-shadow-[0_15px_25px_rgba(56,189,248,0.25)] hover:scale-105 transition-transform duration-300"
            />
            <span className="text-xs font-mono text-slate-400 mt-2">经典题目: 鹈鹕骑行 (SVG 2D 动画)</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              {cat === "all" ? "全部挑战" : cat}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索挑战题目或关键词..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => navigate("/new-challenge")}
            icon={<Plus className="w-4 h-4" />}
            className="shrink-0"
          >
            创建题目
          </Button>
        </div>
      </div>

      {/* Challenges Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-72 rounded-2xl bg-slate-900/40 border border-slate-800 animate-shimmer"
            />
          ))}
        </div>
      ) : filteredChallenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-slate-900/30 border border-slate-800 text-center gap-4">
          <Compass className="w-12 h-12 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-300">未找到匹配的挑战题目</h3>
          <p className="text-sm text-slate-500 max-w-sm">换个关键词试一试，或者亲自创建第一道有趣的测试题！</p>
          <Button variant="primary" onClick={() => navigate("/new-challenge")}>
            立即创建题目
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredChallenges.map((c) => {
            const artUrl = getChallengeArt(c);
            return (
              <Card
                key={c.id}
                hover
                glow
                onClick={() => navigate(`/challenge/${c.id}`)}
                className="flex flex-col justify-between group"
              >
                {/* Art Thumbnail Header */}
                <div className="relative h-44 w-full bg-gradient-to-b from-slate-950 to-slate-900/80 p-4 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
                  <div className="absolute top-3 left-3 z-10">
                    <Badge variant="brand" size="sm">
                      {c.category || "综合挑战"}
                    </Badge>
                  </div>
                  <div className="absolute top-3 right-3 z-10">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-950/80 text-slate-300 border border-slate-700/60 backdrop-blur-sm">
                      v{c.current_version}
                    </span>
                  </div>
                  <img
                    src={artUrl}
                    alt={c.title}
                    className="w-32 h-32 object-contain group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                  />
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-base font-bold text-slate-100 group-hover:text-sky-300 transition-colors line-clamp-1">
                      {c.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {c.description || "暂无描述"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Layers className="w-3.5 h-3.5" />
                      <span>版本 {c.current_version}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/studio?challenge_id=${c.id}`);
                      }}
                      className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold transition-colors cursor-pointer"
                    >
                      <span>去实验</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
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
