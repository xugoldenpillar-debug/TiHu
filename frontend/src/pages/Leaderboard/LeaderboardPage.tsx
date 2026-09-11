import React, { useEffect, useState, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ModelScore, RunSummary } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { VendorBadge } from "../../components/common/VendorIcon";
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
  Eye,
} from "lucide-react";

interface LeaderboardResponse {
  items: (ModelScore & RunSummary)[];
  total: number;
}

export function LeaderboardPage() {
  const { showToast, navigate } = useApp();
  const [group, setGroup] = useState<"models" | "works">("models");
  const [kind, setKind] = useState<"capability" | "funny">("capability");
  const [list, setList] = useState<(ModelScore & RunSummary)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await api<LeaderboardResponse>(
          `/leaderboard?group=${group}&kind=${kind}&limit=50`
        );
        if (mounted) {
          setList(res.items || []);
        }
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
  }, [group, kind, showToast]);

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

  const getScore = (item: Record<string, unknown>) => {
    if (typeof item.score === "number") return item.score;
    const metric = item[kind];
    if (typeof metric === "number") return metric;
    return 0;
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full pb-20 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-white/90 to-white/60 p-8 sm:p-10 border border-slate-200/90 shadow-sm backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-100/40 via-sky-100/30 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-72 h-72 bg-gradient-to-tr from-purple-100/30 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-3 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50/90 border border-amber-200/70 text-amber-800 text-xs font-semibold w-fit shadow-xs">
              <Crown className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
              <span>TiHu 智能体竞技场天梯榜</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              真实沙箱战绩与模型实力榜
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              基于社区创作者真实评测、独立沙箱代码生成与双盲盲测投票。客观反映主流基础模型在
              前端工程、交互设计与 SVG 创意领域的真实编码与智商水平。
            </p>
          </div>

          {/* Dimension Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Group Toggle: Models vs Works */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100/80 border border-slate-200/90 shadow-inner">
              <button
                onClick={() => setGroup("models")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  group === "models"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                <span>模型总榜</span>
              </button>
              <button
                onClick={() => setGroup("works")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  group === "works"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>高分作品</span>
              </button>
            </div>

            {/* Metric Toggle: Capability vs Funny */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100/80 border border-slate-200/90 shadow-inner">
              <button
                onClick={() => setKind("capability")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  kind === "capability"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>综合能力</span>
              </button>
              <button
                onClick={() => setKind("funny")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  kind === "funny"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Smile className="w-3.5 h-3.5 text-rose-400" />
                <span>趣味脑洞</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top 3 Podium Stage (When Models Mode & has data) */}
      {top3.length > 0 && group === "models" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end pt-4">
          {/* Rank 2 (Silver - Left) */}
          {top3[1] ? (
            <div className="order-2 md:order-1 rounded-2xl podium-silver p-6 flex flex-col items-center text-center gap-3 transition-all hover:-translate-y-1">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-black text-base shadow-sm border-2 border-white">
                  2
                </div>
                <Medal className="w-5 h-5 text-slate-500 absolute -bottom-1 -right-1" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <VendorBadge model={top3[1].model} />
                <h3 className="font-bold text-slate-900 text-base mt-1 line-clamp-1">{top3[1].model}</h3>
                <span className="text-[11px] text-slate-500 line-clamp-1 max-w-[200px]">{top3[1].provider}</span>
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
            <div className="order-1 md:order-2 rounded-3xl podium-gold p-8 flex flex-col items-center text-center gap-3.5 md:-translate-y-4 shadow-lg transition-all hover:-translate-y-5 relative">
              <div className="absolute -top-3 px-3 py-0.5 rounded-full bg-amber-500 text-white font-bold text-[10px] tracking-wider uppercase shadow-sm">
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
                <h3 className="font-extrabold text-slate-900 text-lg line-clamp-1">{top3[0].model}</h3>
                <span className="text-xs text-slate-500 line-clamp-1 max-w-[220px]">{top3[0].provider}</span>
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

          {/* Rank 3 (Bronze - Right) */}
          {top3[2] ? (
            <div className="order-3 rounded-2xl podium-bronze p-6 flex flex-col items-center text-center gap-3 transition-all hover:-translate-y-1">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-amber-200/80 text-amber-900 flex items-center justify-center font-black text-base shadow-sm border-2 border-white">
                  3
                </div>
                <Medal className="w-5 h-5 text-amber-700 absolute -bottom-1 -right-1" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <VendorBadge model={top3[2].model} />
                <h3 className="font-bold text-slate-900 text-base mt-1 line-clamp-1">{top3[2].model}</h3>
                <span className="text-[11px] text-slate-500 line-clamp-1 max-w-[200px]">{top3[2].provider}</span>
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

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/80 border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="p-16 rounded-3xl bg-white/80 border border-slate-200 text-center flex flex-col items-center gap-3 backdrop-blur-sm">
          <Trophy className="w-12 h-12 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base">当前维度暂无上榜数据</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            前往实验室运行模型生成作品并公开发布，即可参与全社区模型排名打榜！
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate("/studio")}>
            立即启动实验
          </Button>
        </div>
      ) : group === "models" ? (
        /* Models Leaderboard List */
        <div className="flex flex-col gap-3">
          <div className="px-4 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>排位与基础模型信息</span>
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
                className="group relative rounded-2xl bg-white/85 hover:bg-white border border-slate-200/90 hover:border-slate-300/90 p-4 sm:p-5 transition-all duration-200 shadow-xs hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                      <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                        {item.model}
                      </span>
                      <VendorBadge model={item.model} />
                      {item.is_official ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          官方直连
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                          自定义源
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="truncate max-w-[280px]">{item.provider}</span>
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
                    <span className="text-[10px] text-slate-400 text-right">{percent}% 竞争力</span>
                  </div>

                  <div className="flex flex-col items-end min-w-[60px]">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black text-slate-900">{score}</span>
                      <span className="text-xs text-slate-400 font-medium">票</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                      <Flame className="w-3 h-3" />
                      人气高涨
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Works Showcase Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((work, idx) => {
            const score = getScore(work);
            return (
              <Card
                key={work.id || idx}
                hover
                onClick={() => work.id && navigate(`/run/${work.id}`)}
                className="group flex flex-col overflow-hidden bg-white/90 border-slate-200/90"
              >
                {/* Thumbnail / Art Header */}
                <div className="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200/60 overflow-hidden">
                  {work.id && work.thumbnail_available ? (
                    <img
                      src={`/api/runs/${work.id}/thumbnail`}
                      alt={work.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4 text-center">
                      <Layers className="w-8 h-8 opacity-40" />
                      <span className="text-xs">点击进入实时沙箱预览</span>
                    </div>
                  )}

                  <div className="absolute top-2.5 left-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-black shadow-xs ${
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

                  <div className="absolute bottom-2.5 right-2.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur-xs text-xs font-black text-slate-900 shadow-xs border border-white/40">
                      {kind === "capability" ? (
                        <Zap className="w-3 h-3 text-amber-500" />
                      ) : (
                        <Smile className="w-3 h-3 text-rose-500" />
                      )}
                      <span>{score} 选票</span>
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex flex-col gap-2 flex-1 justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors line-clamp-1">
                        {work.title || "未命名挑战作品"}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <VendorBadge model={work.model} />
                      <span className="text-xs text-slate-500 line-clamp-1">{work.model}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>@{work.username || "创作者"}</span>
                    <span className="text-blue-600 font-medium group-hover:underline">查看生成代码 &rarr;</span>
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
