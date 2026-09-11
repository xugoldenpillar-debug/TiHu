import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { RunSummary, PageResult, Challenge } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { VendorBadge } from "../../components/common/VendorIcon";
import { SandboxPreviewDrawer } from "../../components/common/SandboxPreviewDrawer";
import {
  ThumbsUp,
  Smile,
  Eye,
  ExternalLink,
  GitCompare,
  Sparkles,
  Search,
  Play,
  Layers,
  ArrowUpRight,
  Filter,
  Calendar,
  LayoutGrid,
  Table as TableIcon,
  ShieldCheck,
} from "lucide-react";

export function GalleryPage() {
  const { navigate, showToast, user } = useApp();

  // Data states
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (matching all original catalog.ts dimensions)
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState<"all" | "standard" | "open">("all");
  const [providerScope, setProviderScope] = useState<"all" | "official" | "custom">("all");
  const [timeWindow, setTimeWindow] = useState<"all" | "7d" | "30d">("all");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "capability" | "funny">("newest");
  const [viewMode, setViewMode] = useState<"gallery" | "table">("gallery");

  // Slide-out Sandbox Drawer
  const [previewRun, setPreviewRun] = useState<{ id: string; title: string; model: string } | null>(
    null
  );

  // Load challenges for filter scroller
  useEffect(() => {
    async function loadChallenges() {
      try {
        const res = await api<PageResult<Challenge>>("/challenges?limit=100");
        setChallenges(res.items || []);
      } catch (e) {}
    }
    loadChallenges();
  }, []);

  const loadGallery = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        published: "public",
        limit: "60",
      });
      if (track !== "all") query.set("track", track);
      if (selectedChallengeId) query.set("challenge", selectedChallengeId);

      const res = await api<PageResult<RunSummary>>(`/runs?${query.toString()}`);
      setRuns(res.items || []);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  }, [track, timeWindow, selectedChallengeId, showToast]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const handleVote = async (
    run: RunSummary,
    type: "capability" | "funny",
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!user) {
      showToast("请先登录再进行投票", "warning");
      return;
    }
    try {
      const updated = await api<RunSummary>(`/runs/${run.id}/vote`, {
        method: "PUT",
        body: JSON.stringify({ kind: type, active: true }),
      });
      setRuns((prev) => prev.map((r) => (r.id === run.id ? updated : r)));
      showToast(`已成功为作品投票 (${type === "capability" ? "能力分" : "趣味分"})`, "success");
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  // Filter and sort locally for client-side search & provider_scope
  const displayedRuns = runs
    .filter((r) => {
      // 1. Search text
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (r.title || "").toLowerCase().includes(q);
        const matchModel = (r.model || "").toLowerCase().includes(q);
        const matchAuthor = (r.username || "").toLowerCase().includes(q);
        if (!matchTitle && !matchModel && !matchAuthor) return false;
      }

      // 2. Provider scope
      if (providerScope === "official" && !r.is_official) return false;
      // 3. Time window filter
      if (timeWindow === "7d") {
        const cutoff = Date.now() / 1000 - 7 * 86400;
        if ((r.created || 0) < cutoff) return false;
      } else if (timeWindow === "30d") {
        const cutoff = Date.now() / 1000 - 30 * 86400;
        if ((r.created || 0) < cutoff) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "capability") return (b.capability || 0) - (a.capability || 0);
      if (sortBy === "funny") return (b.funny || 0) - (a.funny || 0);
      return (b.created || 0) - (a.created || 0);
    });

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-24 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-slate-50/70 to-indigo-50/20 p-8 sm:p-10 border border-slate-200/90 shadow-sm backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-purple-100/40 via-sky-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2.5 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold w-fit">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>智能体灵感画廊 · 社区真实作品展</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              探索大模型写就的真实代码与动效
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              这里汇聚了社区开发者使用不同模型在 gVisor 沙箱中生成的独立 HTML 作品。你可以直接在线试玩交互、检视完整的多文件源代码，或为心仪的作品投上一票。
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate("/studio")}
            icon={<Play className="w-4 h-4 text-amber-300 fill-amber-300" />}
            className="shadow-sm hover:shadow-md"
          >
            开启我的实验
          </Button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3.5 p-5 rounded-2xl bg-white/85 border border-slate-200/90 shadow-xs backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* 1. Sort by */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                排序规则:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "newest", label: "最新生成" },
                    { val: "capability", label: "能力分最高" },
                    { val: "funny", label: "脑洞分最高" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setSortBy(opt.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      sortBy === opt.val
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Provider scope */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                服务商来源:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "all", label: "全部" },
                    { val: "official", label: "官方直连" },
                    { val: "custom", label: "自定义源" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setProviderScope(opt.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      providerScope === opt.val
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Track */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                赛道:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "all", label: "全部赛道" },
                    { val: "standard", label: "标准" },
                    { val: "open", label: "开放" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setTrack(opt.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      track === opt.val
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Time Window */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                时间:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "all", label: "全部" },
                    { val: "7d", label: "近 7 天" },
                    { val: "30d", label: "近 30 天" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setTimeWindow(opt.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      timeWindow === opt.val
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Search & View toggle */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索题目/模型/作者..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 shadow-inner"
              />
            </div>

            <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 border border-slate-200/80 shrink-0">
              <button
                onClick={() => setViewMode("gallery")}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "gallery"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="网格卡片"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="数据表格"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Task Capsule Scroller */}
        {challenges.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-0.5 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase tracking-wider">
              题目筛选:
            </span>
            <button
              onClick={() => setSelectedChallengeId("")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedChallengeId === ""
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              全部题目
            </button>
            {challenges.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChallengeId(c.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedChallengeId === c.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content Rendering */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-80 rounded-3xl bg-white/70 border border-slate-200/80 animate-pulse"
            />
          ))}
        </div>
      ) : displayedRuns.length === 0 ? (
        <div className="p-16 rounded-3xl bg-white/85 border border-slate-200 text-center flex flex-col items-center gap-3 shadow-xs">
          <Layers className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base">未找到符合条件的作品</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            尝试放宽赛道或服务商筛选条件，或者前往实验室运行模型生成全新的作品！
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate("/studio")}>
            开启新实验
          </Button>
        </div>
      ) : viewMode === "gallery" ? (
        /* Gallery Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedRuns.map((run) => (
            <Card
              key={run.id}
              hover
              className="group flex flex-col overflow-hidden bg-white/90 border-slate-200/90 shadow-xs hover:shadow-lg transition-all rounded-3xl"
            >
              {/* Thumbnail Header with Hover Play */}
              <div className="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200/60 overflow-hidden">
                {run.thumbnail_available ? (
                  <img
                    src={`/api/runs/${run.id}/thumbnail`}
                    alt={run.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4 text-center">
                    <Layers className="w-8 h-8 opacity-40" />
                    <span className="text-xs">点击启动即时沙箱试玩</span>
                  </div>
                )}

                {/* Top Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[10px] font-semibold backdrop-blur-xs shadow-xs">
                    {run.track === "standard" ? "标准赛道" : "开放赛道"}
                  </span>
                  {run.is_official ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                      官方直连
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-white text-[10px] font-semibold backdrop-blur-xs shadow-xs">
                      自定义源
                    </span>
                  )}
                </div>

                {/* Hover Play Button */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewRun({
                        id: run.id,
                        title: run.title,
                        model: run.model,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-xl hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                    <span>即时沙箱试玩</span>
                  </button>
                </div>

                {/* Score Pills Bottom Right */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 pointer-events-none">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md text-xs font-black text-slate-900 shadow-sm border border-white/40">
                    <ThumbsUp className="w-3 h-3 text-amber-500" />
                    <span>{run.capability || 0}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md text-xs font-black text-slate-900 shadow-sm border border-white/40">
                    <Smile className="w-3 h-3 text-rose-500" />
                    <span>{run.funny || 0}</span>
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 flex flex-col gap-3 flex-1 justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      onClick={() => navigate(`/run/${run.id}`)}
                      className="font-black text-slate-900 text-base hover:text-blue-600 transition-colors line-clamp-1 cursor-pointer"
                    >
                      {run.title || "未命名挑战作品"}
                    </h3>
                    <button
                      onClick={() => navigate(`/run/${run.id}`)}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <VendorBadge model={run.model} />
                    <span className="text-xs text-slate-500 line-clamp-1 font-medium">
                      {run.model}
                    </span>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>@{run.username || "创作者"}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleVote(run, "capability", e)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border border-slate-200/80 transition-colors cursor-pointer"
                      title="为作品能力投票"
                    >
                      <ThumbsUp className="w-3 h-3 text-amber-500" />
                      <span>投能力</span>
                    </button>
                    <button
                      onClick={(e) => handleVote(run, "funny", e)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-800 border border-slate-200/80 transition-colors cursor-pointer"
                      title="为作品趣味投票"
                    >
                      <Smile className="w-3 h-3 text-rose-500" />
                      <span>投趣味</span>
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-x-auto bg-white/90 border-slate-200/90 shadow-xs rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">作品标题与基础模型</th>
                <th className="py-3.5 px-4">服务商来源</th>
                <th className="py-3.5 px-4">赛道</th>
                <th className="py-3.5 px-4 text-center">能力分</th>
                <th className="py-3.5 px-4 text-center">趣味分</th>
                <th className="py-3.5 px-4">作者</th>
                <th className="py-3.5 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRuns.map((run) => (
                <tr key={run.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {run.thumbnail_available ? (
                        <img
                          src={`/api/runs/${run.id}/thumbnail`}
                          alt=""
                          className="w-12 h-8 rounded-md object-cover border border-slate-200 shrink-0"
                        />
                      ) : null}
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-900 line-clamp-1">
                          {run.title}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <VendorBadge model={run.model} />
                          <span className="text-[11px] text-slate-500">{run.model}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    {run.is_official ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        官方直连
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                        自定义源
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                      {run.track === "standard" ? "标准赛道" : "开放赛道"}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-center font-bold text-slate-900">
                    {run.capability || 0}
                  </td>

                  <td className="py-3 px-4 text-center font-bold text-slate-900">
                    {run.funny || 0}
                  </td>

                  <td className="py-3 px-4 text-slate-500">@{run.username || "创作者"}</td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() =>
                          setPreviewRun({
                            id: run.id,
                            title: run.title,
                            model: run.model,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 text-blue-600" />
                        <span>沙箱试玩</span>
                      </button>
                      <button
                        onClick={() => navigate(`/run/${run.id}`)}
                        className="p-1 rounded text-slate-400 hover:text-slate-900 transition-colors"
                        title="查看详情"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Slide-out Live Sandbox Drawer */}
      <SandboxPreviewDrawer
        runId={previewRun?.id || null}
        title={previewRun?.title}
        model={previewRun?.model}
        onClose={() => setPreviewRun(null)}
        onVoteSuccess={() => loadGallery()}
      />
    </div>
  );
}
