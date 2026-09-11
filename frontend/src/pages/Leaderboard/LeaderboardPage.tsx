import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ModelScore, RunSummary, Challenge, PageResult } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { VendorBadge } from "../../components/common/VendorIcon";
import { SandboxPreviewDrawer } from "../../components/common/SandboxPreviewDrawer";
import {
  Trophy,
  Crown,
  Medal,
  Sparkles,
  Zap,
  Smile,
  ExternalLink,
  Layers,
  BarChart3,
  Flame,
  ArrowUpRight,
  Play,
  Table as TableIcon,
  LayoutGrid,
  Calendar,
  Filter,
  ShieldCheck,
  Compass,
} from "lucide-react";

interface LeaderboardResponse {
  items: (ModelScore & RunSummary)[];
  total: number;
}

export function LeaderboardPage() {
  const { showToast, navigate } = useApp();

  // Core dimensions (matching original catalog.ts)
  const [group, setGroup] = useState<"models" | "works">("models");
  const [kind, setKind] = useState<"capability" | "funny">("capability");
  const [providerScope, setProviderScope] = useState<"all" | "official" | "custom">("all");
  const [track, setTrack] = useState<"standard" | "open" | "all">("standard");
  const [days, setDays] = useState<"0" | "7" | "30">("0");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"gallery" | "table">("gallery");

  // Data states
  const [list, setList] = useState<(ModelScore & RunSummary)[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  // Live Sandbox Drawer state
  const [previewRun, setPreviewRun] = useState<{ id: string; title: string; model: string } | null>(
    null
  );

  // Load challenges for task filter scroller
  useEffect(() => {
    async function loadChallenges() {
      try {
        const res = await api<PageResult<Challenge>>("/challenges?limit=100");
        setChallenges(res.items || []);
      } catch (e) {
        // ignore non-critical challenge fetch error
      }
    }
    loadChallenges();
  }, []);

  // Fetch leaderboard data with full filter params
  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        group,
        kind,
        track,
        provider_scope: providerScope,
        days,
        limit: "50",
      });
      if (selectedChallengeId) {
        params.set("challenge", selectedChallengeId);
      }
      const res = await api<LeaderboardResponse>(`/leaderboard?${params.toString()}`);
      setList(res.items || []);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  }, [group, kind, track, providerScope, days, selectedChallengeId, showToast]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const getScore = (item: Record<string, unknown>) => {
    if (typeof item.score === "number") return item.score;
    const metric = item[kind];
    if (typeof metric === "number") return metric;
    return 0;
  };

  const maxScore = useMemo(() => {
    if (!list.length) return 1;
    return Math.max(
      ...list.map((item) => {
        const val = typeof item.score === "number" ? item.score : (item[kind] ?? 0);
        return typeof val === "number" ? val : 0;
      }),
      1
    );
  }, [list, kind]);

  const top3 = useMemo(() => {
    return list.slice(0, 3);
  }, [list]);

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-24 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-slate-50/70 to-blue-50/20 p-8 sm:p-10 border border-slate-200/90 shadow-sm backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-100/40 via-sky-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-72 h-72 bg-gradient-to-tr from-purple-100/30 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50/90 border border-amber-200/70 text-amber-800 text-xs font-bold w-fit shadow-xs">
              <Crown className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
              <span>TiHu 智能体竞技场 · 全维度排位天梯</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              真实代码生成与沙箱战绩排行榜
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              汇集真实社区创作者提交、gVisor 隔离沙箱代码生成与双盲投票结果。支持按官方直连/自定义源分级评定，客观呈现模型在前端工程与创意动效领域的真实编码能力。
            </p>
          </div>

          {/* Quick primary toggle: Models vs Works */}
          <div className="flex items-center p-1.5 rounded-2xl bg-white/90 border border-slate-200 shadow-sm">
            <button
              onClick={() => setGroup("models")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                group === "models"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
              <span>AI 模型天梯榜</span>
            </button>
            <button
              onClick={() => setGroup("works")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                group === "works"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>社区高分作品</span>
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Dimensional Filter Toolbar (Restoring ALL original dimensions) */}
      <div className="flex flex-col gap-3 p-5 rounded-2xl bg-white/80 border border-slate-200/90 shadow-xs backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-4">
            {/* 1. Evaluation Metric: Capability vs Funny */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                评价维度:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                <button
                  onClick={() => setKind("capability")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    kind === "capability"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>能力分</span>
                </button>
                <button
                  onClick={() => setKind("funny")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    kind === "funny"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Smile className="w-3 h-3 text-rose-500" />
                  <span>趣味分</span>
                </button>
              </div>
            </div>

            {/* 2. Provider Scope: All vs Official vs Custom */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                服务商来源:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "all", label: "全部来源" },
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

            {/* 3. Track: Standard vs Open vs All */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                赛道限制:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "standard", label: "标准赛道" },
                    { val: "open", label: "开放赛道" },
                    { val: "all", label: "全部赛道" },
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

            {/* 4. Time Window: All vs 7d vs 30d */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                时间范围:
              </span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    { val: "0", label: "全部时间" },
                    { val: "7", label: "近 7 天" },
                    { val: "30", label: "近 30 天" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => setDays(opt.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      days === opt.val
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

          {/* View Mode Toggle: Gallery vs Table */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              onClick={() => setViewMode("gallery")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "gallery"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="网格卡片视图"
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
              title="密集表格视图"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Challenge Task Capsule Scroller */}
        {challenges.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 uppercase tracking-wider">
              精选题库:
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

      {/* Top 3 Podium Stage (When Models Mode & has data) */}
      {top3.length > 0 && group === "models" && viewMode === "gallery" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end pt-2">
          {/* Rank 2 (Silver) */}
          {top3[1] ? (
            <div className="order-2 md:order-1 rounded-3xl podium-silver p-6 flex flex-col items-center text-center gap-3 transition-all hover:-translate-y-1">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-black text-base shadow-sm border-2 border-white">
                  2
                </div>
                <Medal className="w-5 h-5 text-slate-500 absolute -bottom-1 -right-1" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <VendorBadge model={top3[1].model} />
                <h3 className="font-extrabold text-slate-900 text-base mt-1 line-clamp-1">
                  {top3[1].model}
                </h3>
                <span className="text-[11px] text-slate-500 line-clamp-1 max-w-[200px]">
                  {top3[1].provider}
                </span>
              </div>
              <div className="mt-2 w-full pt-3 border-t border-slate-200/60 flex items-center justify-around text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">天梯选票</span>
                  <span className="font-black text-slate-800 text-base">{getScore(top3[1])}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">作品沉淀</span>
                  <span className="font-semibold text-slate-700">{top3[1].entries || 1} 份</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="order-2 md:order-1" />
          )}

          {/* Rank 1 (Gold - Center - Highest) */}
          {top3[0] && (
            <div className="order-1 md:order-2 rounded-3xl podium-gold p-8 flex flex-col items-center text-center gap-3.5 md:-translate-y-4 shadow-xl transition-all hover:-translate-y-5 relative">
              <div className="absolute -top-3 px-3 py-0.5 rounded-full bg-amber-500 text-white font-black text-[10px] tracking-wider uppercase shadow-sm">
                Champion
              </div>
              <div className="relative mt-1">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-200 text-amber-950 flex items-center justify-center font-black text-xl shadow-md border-4 border-white">
                  1
                </div>
                <Crown className="w-7 h-7 text-amber-600 absolute -top-4 -right-2 transform rotate-12" />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <VendorBadge model={top3[0].model} />
                <h3 className="font-black text-slate-900 text-lg line-clamp-1">{top3[0].model}</h3>
                <span className="text-xs text-slate-500 line-clamp-1 max-w-[220px]">
                  {top3[0].provider}
                </span>
              </div>
              <div className="mt-3 w-full pt-4 border-t border-amber-200/60 flex items-center justify-around text-xs">
                <div>
                  <span className="text-amber-800/70 text-[11px] block font-medium">冠军胜分</span>
                  <span className="font-black text-amber-900 text-2xl">{getScore(top3[0])}</span>
                </div>
                <div>
                  <span className="text-amber-800/70 text-[11px] block font-medium">验证成果</span>
                  <span className="font-bold text-amber-950 text-base">{top3[0].entries || 1} 份作品</span>
                </div>
              </div>
            </div>
          )}

          {/* Rank 3 (Bronze) */}
          {top3[2] ? (
            <div className="order-3 rounded-3xl podium-bronze p-6 flex flex-col items-center text-center gap-3 transition-all hover:-translate-y-1">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-amber-200/80 text-amber-900 flex items-center justify-center font-black text-base shadow-sm border-2 border-white">
                  3
                </div>
                <Medal className="w-5 h-5 text-amber-700 absolute -bottom-1 -right-1" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <VendorBadge model={top3[2].model} />
                <h3 className="font-extrabold text-slate-900 text-base mt-1 line-clamp-1">
                  {top3[2].model}
                </h3>
                <span className="text-[11px] text-slate-500 line-clamp-1 max-w-[200px]">
                  {top3[2].provider}
                </span>
              </div>
              <div className="mt-2 w-full pt-3 border-t border-amber-200/60 flex items-center justify-around text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">天梯选票</span>
                  <span className="font-black text-slate-800 text-base">{getScore(top3[2])}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">作品沉淀</span>
                  <span className="font-semibold text-slate-700">{top3[2].entries || 1} 份</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="order-3" />
          )}
        </div>
      )}

      {/* Main List Rendering */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-white/80 border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="p-16 rounded-3xl bg-white/80 border border-slate-200 text-center flex flex-col items-center gap-3 shadow-xs backdrop-blur-sm">
          <Trophy className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base">此筛选组合下暂无排位数据</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            尝试放宽服务商来源、时间范围或赛道限制，或者前往实验室发布新实验！
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate("/studio")}>
            开启新实验
          </Button>
        </div>
      ) : group === "models" && viewMode === "gallery" ? (
        /* Models Cards List */
        <div className="flex flex-col gap-3">
          <div className="px-4 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>基础模型排位与厂商信息</span>
            <div className="flex items-center gap-12">
              <span className="hidden sm:inline">评测胜率分布</span>
              <span>社区得票</span>
            </div>
          </div>

          {list.map((item, idx) => {
            const score = getScore(item);
            const percent = Math.min(100, Math.max(10, Math.round((score / maxScore) * 100)));
            const isTop3 = idx < 3;

            return (
              <div
                key={item.model + (item.provider || "") + idx}
                className="group relative rounded-2xl bg-white/90 hover:bg-white border border-slate-200/90 hover:border-slate-300/90 p-4 sm:p-5 transition-all duration-200 shadow-xs hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Left: Rank & Model Info */}
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                      idx === 0
                        ? "bg-amber-100 text-amber-800 border border-amber-300/60"
                        : idx === 1
                        ? "bg-slate-200 text-slate-700 border border-slate-300/60"
                        : idx === 2
                        ? "bg-orange-100 text-orange-800 border border-orange-300/60"
                        : "bg-slate-50 text-slate-500 border border-slate-200/60"
                    }`}
                  >
                    {idx + 1}
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                        {item.model}
                      </span>
                      <VendorBadge model={item.model} />
                      {item.is_official ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          官方直连
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                          自定义源
                        </span>
                      )}
                      {item.track && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                          {item.track === "standard" ? "标准赛道" : "开放赛道"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="truncate max-w-[280px] font-mono text-[11px]">
                        {item.provider}
                      </span>
                      <span>·</span>
                      <span>{item.entries || 1} 件作品</span>
                      {item.authors ? (
                        <>
                          <span>·</span>
                          <span>{item.authors} 位作者</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right: Progress bar & Score */}
                <div className="flex items-center gap-6 self-end sm:self-center">
                  <div className="hidden sm:flex flex-col gap-1 w-36">
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isTop3
                            ? "bg-gradient-to-r from-amber-400 to-amber-500"
                            : "bg-gradient-to-r from-blue-500 to-indigo-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 text-right font-medium">
                      {percent}% 胜率指数
                    </span>
                  </div>

                  <div className="flex flex-col items-end min-w-[60px]">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-slate-900">{score}</span>
                      <span className="text-xs text-slate-400 font-medium">票</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <Flame className="w-3 h-3" />
                      人气高涨
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : group === "works" && viewMode === "gallery" ? (
        /* Works Cards List with Live Preview Drawer Trigger */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((work, idx) => {
            const score = getScore(work);
            return (
              <Card
                key={work.id || idx}
                hover
                className="group flex flex-col overflow-hidden bg-white/90 border-slate-200/90 shadow-xs hover:shadow-lg transition-all rounded-3xl"
              >
                {/* Thumbnail Header with Interactive Hover Overlay */}
                <div className="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200/60 overflow-hidden">
                  {work.id && work.thumbnail_available ? (
                    <img
                      src={`/api/runs/${work.id}/thumbnail`}
                      alt={work.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4 text-center">
                      <Layers className="w-8 h-8 opacity-40" />
                      <span className="text-xs">点击即刻启动沙箱预览</span>
                    </div>
                  )}

                  {/* Top Rank Badge */}
                  <div className="absolute top-3 left-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-black shadow-xs ${
                        idx === 0
                          ? "bg-amber-400 text-amber-950"
                          : idx === 1
                          ? "bg-slate-200 text-slate-800"
                          : idx === 2
                          ? "bg-orange-300 text-orange-950"
                          : "bg-black/60 text-white backdrop-blur-xs"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Top Right Source Badge */}
                  <div className="absolute top-3 right-3">
                    {work.is_official ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                        官方直连
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[10px] font-semibold backdrop-blur-xs shadow-xs">
                        自定义源
                      </span>
                    )}
                  </div>

                  {/* Hover Live Sandbox Drawer Trigger Overlay */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewRun({
                          id: work.id,
                          title: work.title,
                          model: work.model,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-xl hover:scale-105 transition-transform cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                      <span>实时沙箱试玩</span>
                    </button>
                  </div>

                  {/* Bottom Score Ribbon */}
                  <div className="absolute bottom-3 right-3 pointer-events-none">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md text-xs font-black text-slate-900 shadow-sm border border-white/40">
                      {kind === "capability" ? (
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Smile className="w-3.5 h-3.5 text-rose-500" />
                      )}
                      <span>{score} 选票</span>
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        onClick={() => work.id && navigate(`/run/${work.id}`)}
                        className="font-black text-slate-900 text-sm hover:text-blue-600 transition-colors line-clamp-1 cursor-pointer"
                      >
                        {work.title || "未命名挑战作品"}
                      </h3>
                      <button
                        onClick={() => work.id && navigate(`/run/${work.id}`)}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <VendorBadge model={work.model} />
                      <span className="text-xs text-slate-500 line-clamp-1 font-medium">
                        {work.model}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>@{work.username || "创作者"}</span>
                    <button
                      onClick={() =>
                        setPreviewRun({
                          id: work.id,
                          title: work.title,
                          model: work.model,
                        })
                      }
                      className="text-blue-600 font-bold hover:underline cursor-pointer"
                    >
                      即时试玩 &rarr;
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Unified High-Density Precision Table Mode (Restoring LMSYS Arena style) */
        <Card className="overflow-x-auto bg-white/90 border-slate-200/90 shadow-xs rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4 text-center w-16">排名</th>
                <th className="py-3.5 px-4">{group === "models" ? "AI 基础模型" : "作品与模型"}</th>
                <th className="py-3.5 px-4">服务商来源</th>
                <th className="py-3.5 px-4">赛道</th>
                <th className="py-3.5 px-4 text-right">社区得票</th>
                <th className="py-3.5 px-4">{group === "models" ? "作品与作者数" : "创作者"}</th>
                <th className="py-3.5 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((item, idx) => {
                const score = getScore(item);
                const isWork = "id" in item && Boolean(item.id);

                return (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-black">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs ${
                          idx === 0
                            ? "bg-amber-100 text-amber-900 font-black"
                            : idx === 1
                            ? "bg-slate-200 text-slate-800"
                            : idx === 2
                            ? "bg-orange-100 text-orange-900"
                            : "text-slate-400 font-mono"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {isWork && item.thumbnail_available ? (
                          <img
                            src={`/api/runs/${item.id}/thumbnail`}
                            alt=""
                            className="w-10 h-7 rounded-md object-cover border border-slate-200 shrink-0"
                          />
                        ) : null}
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-900">{item.model}</span>
                            <VendorBadge model={item.model} />
                          </div>
                          {isWork && (
                            <span className="text-[11px] text-slate-500 line-clamp-1">
                              {item.title}
                            </span>
                          )}
                          {!isWork && (
                            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[240px]">
                              {item.provider}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {item.is_official ? (
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
                        {item.track === "standard" ? "标准赛道" : "开放赛道"}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <span className="font-black text-slate-900 text-sm">{score}</span>
                      <span className="text-slate-400 text-[10px] ml-1">票</span>
                    </td>

                    <td className="py-3 px-4 text-slate-500">
                      {group === "models" ? (
                        <span>
                          {item.entries || 1} 份作品 · {item.authors || 1} 位作者
                        </span>
                      ) : (
                        <span>@{item.username || "创作者"}</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {isWork ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              setPreviewRun({
                                id: item.id,
                                title: item.title,
                                model: item.model,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-blue-600" />
                            <span>试玩</span>
                          </button>
                          <button
                            onClick={() => navigate(`/run/${item.id}`)}
                            className="p-1 rounded text-slate-400 hover:text-slate-900 transition-colors"
                            title="查看详情"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => navigate(`/gallery`)}
                          className="text-blue-600 font-bold hover:underline"
                        >
                          浏览作品
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
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
        onVoteSuccess={() => loadLeaderboard()}
      />
    </div>
  );
}
