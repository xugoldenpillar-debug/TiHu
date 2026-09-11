import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ModelScore } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { VendorBadge } from "../../components/common/VendorIcon";
import {
  Trophy,
  Medal,
  Sparkles,
  Flame,
  Award,
  Layers,
  Users,
  ShieldCheck,
} from "lucide-react";

export function LeaderboardPage() {
  const { showToast } = useApp();
  const [scores, setScores] = useState<ModelScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const query = new URLSearchParams();
        if (selectedTrack !== "all") query.set("track", selectedTrack);
        const res = await api<ModelScore[]>(`/leaderboard?${query.toString()}`);
        if (mounted) setScores(res || []);
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
  }, [selectedTrack, showToast]);

  const top3 = scores.slice(0, 3);

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Trophy className="w-8 h-8 text-amber-400" />
            <span>模型竞技场天梯榜 (Arena Leaderboard)</span>
          </h1>
          <Badge variant="brand">社区真实评分</Badge>
        </div>
        <p className="text-slate-400 text-sm">
          基于双盲对照及作品能力投票构建的综合评分。排除环境差异，反映大模型在复杂代码构建中的真实表现。
        </p>
      </div>

      {/* Top 3 Podium Cards */}
      {scores.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* Rank 2 */}
          <Card className="p-6 flex flex-col items-center text-center gap-3 order-2 md:order-1 border-slate-700/60 bg-gradient-to-b from-slate-900/90 to-slate-950">
            <div className="w-12 h-12 rounded-2xl bg-slate-700/30 border border-slate-600/50 flex items-center justify-center text-slate-300 font-extrabold text-xl">
              2
            </div>
            <VendorBadge name={top3[1].model} label={top3[1].model} />
            <span className="text-2xl font-extrabold text-slate-200 font-mono">
              {top3[1].score.toFixed(1)} 分
            </span>
            <span className="text-xs text-slate-400">
              {top3[1].entries} 份作品 · {top3[1].challenges} 个挑战
            </span>
          </Card>

          {/* Rank 1 (Gold) */}
          <Card className="p-6 flex flex-col items-center text-center gap-3 order-1 md:order-2 border-amber-500/40 bg-gradient-to-b from-amber-950/20 via-slate-900/90 to-slate-950 shadow-2xl shadow-amber-500/10 md:-translate-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
              👑
            </div>
            <div className="flex items-center gap-2">
              <VendorBadge name={top3[0].model} label={top3[0].model} />
              {top3[0].is_official && <Badge variant="brand" size="sm">官方基准</Badge>}
            </div>
            <span className="text-3xl font-extrabold text-gradient-gold font-mono">
              {top3[0].score.toFixed(1)} 分
            </span>
            <span className="text-xs text-amber-300/80 font-medium">
              榜首领跑 · {top3[0].entries} 份作品 · {top3[0].authors} 位创作者
            </span>
          </Card>

          {/* Rank 3 */}
          <Card className="p-6 flex flex-col items-center text-center gap-3 order-3 md:order-3 border-slate-700/60 bg-gradient-to-b from-slate-900/90 to-slate-950">
            <div className="w-12 h-12 rounded-2xl bg-amber-900/20 border border-amber-700/40 flex items-center justify-center text-amber-600 font-extrabold text-xl">
              3
            </div>
            <VendorBadge name={top3[2].model} label={top3[2].model} />
            <span className="text-2xl font-extrabold text-slate-200 font-mono">
              {top3[2].score.toFixed(1)} 分
            </span>
            <span className="text-xs text-slate-400">
              {top3[2].entries} 份作品 · {top3[2].challenges} 个挑战
            </span>
          </Card>
        </div>
      )}

      {/* Full Leaderboard Table */}
      <Card className="p-6 bg-slate-900/90 border border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Award className="w-4 h-4 text-sky-400" />
            <span>全量模型天梯位次 ({scores.length})</span>
          </h3>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedTrack("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                selectedTrack === "all" ? "bg-sky-500 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              全部赛道
            </button>
            <button
              onClick={() => setSelectedTrack("standard")}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                selectedTrack === "standard" ? "bg-sky-500 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              标准赛道
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 pt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-950/60 border border-slate-800 animate-shimmer" />
            ))}
          </div>
        ) : scores.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            暂无排行榜数据，快去给画廊作品投出第一票吧！
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-800/80 mt-2">
            {scores.map((item, index) => {
              const rank = index + 1;
              return (
                <div
                  key={`${item.model}-${item.provider}-${index}`}
                  className="flex items-center justify-between py-4 px-2 hover:bg-slate-800/40 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs font-mono ${
                        rank === 1
                          ? "bg-amber-500 text-slate-950"
                          : rank === 2
                            ? "bg-slate-400 text-slate-950"
                            : rank === 3
                              ? "bg-amber-700 text-white"
                              : "text-slate-500 bg-slate-800/60"
                      }`}
                    >
                      {rank}
                    </span>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <VendorBadge name={item.model} label={item.model} />
                        {item.is_official && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            官方基准
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        供应商: {item.provider} · 覆盖 {item.challenges} 道题 · {item.authors} 位创作者
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                      <span className="text-lg font-extrabold text-sky-400 font-mono">
                        {item.score.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        有效作品 {item.entries} 篇
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
