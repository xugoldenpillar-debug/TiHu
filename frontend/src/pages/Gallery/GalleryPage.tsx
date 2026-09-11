import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { RunSummary, PageResult } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { VendorIcon, VendorBadge } from "../../components/common/VendorIcon";
import {
  ThumbsUp,
  Smile,
  Eye,
  Clock,
  ExternalLink,
  GitCompare,
  Sparkles,
  Search,
  Filter,
} from "lucide-react";

export function GalleryPage() {
  const { navigate, showToast, user } = useApp();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<"all" | "7d" | "30d">("all");
  const [sortBy, setSortBy] = useState<"capability" | "funny" | "newest">("newest");
  const [filterModel, setFilterModel] = useState<string>("");

  const loadGallery = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        published: "true",
        limit: "50",
      });
      if (timeWindow !== "all") query.set("time_window", timeWindow);
      const res = await api<PageResult<RunSummary>>(`/runs?${query.toString()}`);
      setRuns(res.items || []);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  }, [timeWindow, showToast]);

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
        method: "POST",
        body: JSON.stringify({ vote_type: type }),
      });
      setRuns((prev) => prev.map((r) => (r.id === run.id ? updated : r)));
      showToast(`已成功为作品投票 (${type === "capability" ? "能力分" : "趣味分"})`, "success");
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  const sortedRuns = [...runs].sort((a, b) => {
    if (sortBy === "capability") return b.capability - a.capability;
    if (sortBy === "funny") return b.funny - a.funny;
    return b.created - a.created;
  });

  const filteredRuns = filterModel
    ? sortedRuns.filter(
        (r) =>
          r.model.toLowerCase().includes(filterModel.toLowerCase()) ||
          r.title.toLowerCase().includes(filterModel.toLowerCase())
      )
    : sortedRuns;

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              社区作品画廊
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              公开成果
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            由各路大模型在无人工干预的隔离沙箱中真实生成的互动网页与动画作品。
          </p>
        </div>

        <Button
          variant="glow"
          onClick={() => navigate("/studio")}
          icon={<Sparkles className="w-4 h-4" />}
        >
          我也做一个
        </Button>
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Time window */}
          <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setTimeWindow("all")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                timeWindow === "all"
                  ? "bg-sky-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              全部作品
            </button>
            <button
              onClick={() => setTimeWindow("7d")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                timeWindow === "7d"
                  ? "bg-sky-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              近 7 天新作
            </button>
            <button
              onClick={() => setTimeWindow("30d")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                timeWindow === "30d"
                  ? "bg-sky-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              近 30 天
            </button>
          </div>

          {/* Sort */}
          <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setSortBy("newest")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                sortBy === "newest"
                  ? "bg-slate-800 text-sky-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              最新发布
            </button>
            <button
              onClick={() => setSortBy("capability")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                sortBy === "capability"
                  ? "bg-slate-800 text-sky-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              能力分最高
            </button>
            <button
              onClick={() => setSortBy("funny")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                sortBy === "funny"
                  ? "bg-slate-800 text-sky-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              趣味分最高
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="筛选模型或题目..."
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Gallery Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-80 rounded-2xl bg-slate-900/40 border border-slate-800 animate-shimmer"
            />
          ))}
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-slate-900/30 border border-slate-800 text-center gap-4">
          <Eye className="w-12 h-12 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-300">暂无公开的作品</h3>
          <p className="text-sm text-slate-500">快去实验室完成第一个实验并公开发布吧！</p>
          <Button variant="primary" onClick={() => navigate("/studio")}>
            开始我的实验
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRuns.map((run) => {
            const hasVotedCap = run.my_votes?.includes("capability");
            const hasVotedFun = run.my_votes?.includes("funny");

            return (
              <Card
                key={run.id}
                hover
                glow
                onClick={() => navigate(`/run/${run.id}`)}
                className="flex flex-col justify-between group"
              >
                {/* Thumbnail Preview Area */}
                <div className="relative h-48 w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800">
                  {run.thumbnail_available ? (
                    <img
                      src={`/api/runs/${run.id}/thumbnail.jpg`}
                      alt={run.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-500">
                      <VendorIcon name={run.model} size={36} />
                      <span className="text-[11px] font-mono">
                        {run.model}
                      </span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3">
                    <VendorBadge name={run.model} label={run.model} />
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{run.title}</span>
                      <span>v{run.version}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-sky-300 transition-colors line-clamp-1">
                      {run.username} 的实验成果
                    </h3>
                  </div>

                  {/* Metrics & Votes Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleVote(run, "capability", e)}
                        title="投一票：能力强"
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          hasVotedCap
                            ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{run.capability}</span>
                      </button>

                      <button
                        onClick={(e) => handleVote(run, "funny", e)}
                        title="投一票：有趣/有创意"
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          hasVotedFun
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <Smile className="w-3.5 h-3.5" />
                        <span>{run.funny}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/compare?a=${run.id}`);
                        }}
                        title="拉入对比栏"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <GitCompare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/run/${run.id}`);
                        }}
                        title="全屏查看并交互"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
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
