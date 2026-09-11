import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ModelScore } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { VendorBadge } from "../../components/common/VendorIcon";
import {
  Trophy,
  Award,
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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-200">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            <span>模型竞技场天梯榜 (Arena Leaderboard)</span>
          </h1>
          <Badge variant="brand">社区真实评分</Badge>
        </div>
        <p className="text-slate-500 text-xs">
          基于双盲对照及真实作品能力投票构建的综合得分，反映大模型在复杂代码构建中的真实水平。
        </p>
      </div>

      {/* Top 3 Podium */}
      {scores.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Rank 2 */}
          <Card className="p-5 flex flex-col items-center text-center gap-2.5 order-2 md:order-1 bg-white border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-base">
              2
            </div>
            <VendorBadge name={top3[1].model} label={top3[1].model} />
            <span className="text-xl font-bold text-slate-900 font-mono">
              {top3[1].score.toFixed(1)} 分
            </span>
            <span className="text-xs text-slate-400">
              {top3[1].entries} 份作品 · {top3[1].challenges} 个挑战
            </span>
          </Card>

          {/* Rank 1 */}
          <Card className="p-6 flex flex-col items-center text-center gap-2.5 order-1 md:order-2 bg-gradient-to-b from-amber-50/50 to-white border-amber-200 shadow-sm md:-translate-y-1">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 font-bold text-xl flex items-center justify-center border border-amber-200">
              👑
            </div>
            <div className="flex items-center gap-1.5">
              <VendorBadge name={top3[0].model} label={top3[0].model} />
              {top3[0].is_official && <Badge variant="brand" size="sm">基准</Badge>}
            </div>
            <span className="text-2xl font-extrabold text-amber-900 font-mono">
              {top3[0].score.toFixed(1)} 分
            </span>
            <span className="text-xs text-amber-700 font-medium">
              榜首领跑 · {top3[0].entries} 份作品 · {top3[0].authors} 位创作者
            </span>
          </Card>

          {/* Rank 3 */}
          <Card className="p-5 flex flex-col items-center text-center gap-2.5 order-3 md:order-3 bg-white border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-700 font-bold text-base">
              3
            </div>
            <VendorBadge name={top3[2].model} label={top3[2].model} />
            <span className="text-xl font-bold text-slate-900 font-mono">
              {top3[2].score.toFixed(1)} 分
            </span>
            <span className="text-xs text-slate-400">
              {top3[2].entries} 份作品 · {top3[2].challenges} 个挑战
            </span>
          </Card>
        </div>
      )}

      {/* Full Leaderboard Table */}
      <Card className="p-5 bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-slate-700" />
            <span>全量模型位次 ({scores.length})</span>
          </h3>

          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 text-xs">
            <button
              onClick={() => setSelectedTrack("all")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                selectedTrack === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              全部赛道
            </button>
            <button
              onClick={() => setSelectedTrack("standard")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                selectedTrack === "standard" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              标准赛道
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5 pt-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : scores.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            暂无榜单数据
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100 mt-1">
            {scores.map((item, index) => {
              const rank = index + 1;
              return (
                <div
                  key={`${item.model}-${item.provider}-${index}`}
                  className="flex items-center justify-between py-3 px-2 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs font-mono ${
                        rank === 1
                          ? "bg-amber-100 text-amber-800"
                          : rank === 2
                            ? "bg-slate-200 text-slate-700"
                            : rank === 3
                              ? "bg-orange-100 text-orange-800"
                              : "text-slate-400 bg-slate-100"
                      }`}
                    >
                      {rank}
                    </span>

                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <VendorBadge name={item.model} label={item.model} />
                        {item.is_official && (
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            基准
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        服务商: {item.provider} · 覆盖 {item.challenges} 道题 · {item.authors} 位创作者
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {item.score.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {item.entries} 份作品
                    </span>
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
