import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { RunSummary, PageResult } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { VendorBadge } from "../../components/common/VendorIcon";
import {
  History,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export function MyRunsPage() {
  const { navigate, showToast, user, openAuthModal } = useApp();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const res = await api<PageResult<RunSummary>>("/runs?owner=me&limit=50");
        if (mounted) setRuns(res.items || []);
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
  }, [user, showToast]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-16 max-w-md mx-auto text-center gap-3">
        <History className="w-10 h-10 text-slate-400" />
        <h2 className="text-xl font-bold text-slate-900">请先登录创作者账号</h2>
        <Button onClick={() => openAuthModal("login")}>立即登录</Button>
      </div>
    );
  }

  const filteredRuns = runs.filter((r) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "running") return r.status === "queued" || r.status === "running";
    if (filterStatus === "succeeded") return r.status === "succeeded" || r.status === "finished";
    if (filterStatus === "failed") return r.status === "failed";
    if (filterStatus === "published") return r.published;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-slate-700" />
            <span>我的实验历史 (My Runs)</span>
          </h1>
          <p className="text-xs text-slate-500">
            你在独立沙箱中发起的所有模型 coding 实验记录与产物快照。
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate("/studio")}
          icon={<Sparkles className="w-3.5 h-3.5" />}
        >
          新建实验
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200 text-xs w-fit shadow-xs">
        {[
          { key: "all", label: "全部" },
          { key: "running", label: "进行中" },
          { key: "succeeded", label: "已完成" },
          { key: "published", label: "已公开" },
          { key: "failed", label: "中断" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilterStatus(t.key)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterStatus === t.key
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center flex flex-col items-center gap-3 shadow-xs">
          <p className="text-xs text-slate-500">暂无相关实验记录</p>
          <Button variant="secondary" size="sm" onClick={() => navigate("/studio")}>
            去发起一个实验
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredRuns.map((r) => {
            const isLive = r.status === "queued" || r.status === "running";
            return (
              <Card
                key={r.id}
                hover
                onClick={() => navigate(`/run/${r.id}`)}
                className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    <VendorBadge name={r.model} label={r.model} />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{r.title}</span>
                      <span className="text-xs text-slate-400 font-mono">v{r.version}</span>
                      {r.published && (
                        <span className="text-[10px] font-medium px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          已公开
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {new Date(r.created * 1000).toLocaleString()} · 消耗: {r.metrics?.tokens?.total ?? 0} Token
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  {isLive ? (
                    <span className="flex items-center gap-1.5 text-xs text-sky-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                      运行中...
                    </span>
                  ) : r.status === "succeeded" || r.status === "finished" ? (
                    <span className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 已完成
                    </span>
                  ) : (
                    <span className="text-xs text-rose-700 flex items-center gap-1 font-medium">
                      <XCircle className="w-3.5 h-3.5" /> 中断
                    </span>
                  )}

                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
