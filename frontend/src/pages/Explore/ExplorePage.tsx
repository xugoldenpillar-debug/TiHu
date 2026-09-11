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
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-16 animate-in fade-in duration-200">
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden p-8 sm:p-10 lg:p-12 border border-slate-200/90 bg-white shadow-xs">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-sky-100/50 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 -mb-20 w-72 h-72 rounded-full bg-indigo-50/60 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="flex flex-col gap-3.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium w-fit">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>智能体极限评测 · BYOK 模式</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
              探索真实高难挑战，
              <br />
              <span className="text-slate-700 font-bold">检验大模型代码表现</span>
            </h1>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              选择题目并连接自己的 API Key，在隔离的 gVisor 沙箱中由 pi 0.85.1 编码智能体自包含构建。
              支持多文件源码检视、沙箱交互预览与社区天梯对比。
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="primary"
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
                icon={<Flame className="w-4 h-4 text-amber-500" />}
              >
                浏览公开画廊
              </Button>
            </div>
          </div>

          {/* Hero Art */}
          <div className="hidden lg:flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 border border-slate-200/80">
            <img
              src="/art/challenge-pelican.svg"
              alt="Pelican on Bicycle"
              className="w-44 h-44 object-contain hover:scale-105 transition-transform duration-200"
            />
            <span className="text-xs text-slate-500 mt-2 font-medium">经典挑战：鹈鹕骑行 2D 动画</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-slate-200/90 shadow-xs overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {cat === "all" ? "全部挑战" : cat}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索挑战题目..."
              className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-800 shadow-xs"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      ) : filteredChallenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-white border border-slate-200 text-center gap-3 shadow-xs">
          <Compass className="w-10 h-10 text-slate-400" />
          <h3 className="text-base font-semibold text-slate-800">未找到匹配的挑战题目</h3>
          <p className="text-xs text-slate-500 max-w-sm">换个关键词试试，或者亲自创建第一道有趣的测试题！</p>
          <Button variant="primary" size="sm" onClick={() => navigate("/new-challenge")}>
            立即创建题目
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChallenges.map((c) => {
            const artUrl = getChallengeArt(c);
            return (
              <Card
                key={c.id}
                hover
                onClick={() => navigate(`/challenge/${c.id}`)}
                className="flex flex-col justify-between group"
              >
                {/* Art Thumbnail Header */}
                <div className="relative h-40 w-full bg-slate-50 p-4 flex items-center justify-center overflow-hidden border-b border-slate-100">
                  <div className="absolute top-3 left-3 z-10">
                    <Badge variant="neutral" size="sm">
                      {c.category || "综合挑战"}
                    </Badge>
                  </div>
                  <div className="absolute top-3 right-3 z-10">
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shadow-xs">
                      v{c.current_version}
                    </span>
                  </div>
                  <img
                    src={artUrl}
                    alt={c.title}
                    className="w-28 h-28 object-contain group-hover:scale-105 transition-transform duration-200"
                  />
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-700 transition-colors line-clamp-1">
                      {c.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {c.description || "暂无描述"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Layers className="w-3.5 h-3.5" />
                      <span>版本 {c.current_version}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/studio?challenge_id=${c.id}`);
                      }}
                      className="flex items-center gap-1 text-slate-900 hover:text-sky-600 font-semibold transition-colors cursor-pointer"
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
