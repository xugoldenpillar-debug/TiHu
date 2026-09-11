import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { RunSummary, PageResult } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Input";
import { VendorBadge } from "../../components/common/VendorIcon";
import {
  GitCompare,
  ArrowLeft,
  RotateCw,
  ThumbsUp,
  Smile,
  Cpu,
  Clock,
  Zap,
} from "lucide-react";

export function ComparePage() {
  const { navigate, showToast } = useApp();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runAId, setRunAId] = useState<string>("");
  const [runBId, setRunBId] = useState<string>("");
  const [runA, setRunA] = useState<RunSummary | null>(null);
  const [runB, setRunB] = useState<RunSummary | null>(null);
  const [previewA, setPreviewA] = useState<string | null>(null);
  const [previewB, setPreviewB] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Parse initial query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get("a");
    const b = params.get("b");
    if (a) setRunAId(a);
    if (b) setRunBId(b);
  }, []);

  // Fetch published runs for selection
  useEffect(() => {
    let mounted = true;
    async function loadPublished() {
      try {
        const res = await api<PageResult<RunSummary>>("/runs?published=true&limit=50");
        if (!mounted) return;
        const items = res.items || [];
        setRuns(items);
        if (items.length > 0) {
          if (!runAId) setRunAId(items[0].id);
          if (!runBId && items.length > 1) setRunBId(items[1].id);
        }
      } catch (err) {
        if (mounted) showToast(errorText(err), "error");
      }
    }
    loadPublished();
    return () => {
      mounted = false;
    };
  }, [showToast]);

  // Load details and previews for A & B
  useEffect(() => {
    if (!runAId) return;
    let mounted = true;
    async function fetchA() {
      try {
        const [detail, prev] = await Promise.all([
          api<RunSummary>(`/runs/${runAId}`),
          api<{ url: string }>(`/runs/${runAId}/preview-link`),
        ]);
        if (!mounted) return;
        setRunA(detail);
        setPreviewA(prev.url);
      } catch {
        // ignore
      }
    }
    fetchA();
    return () => {
      mounted = false;
    };
  }, [runAId]);

  useEffect(() => {
    if (!runBId) return;
    let mounted = true;
    async function fetchB() {
      try {
        const [detail, prev] = await Promise.all([
          api<RunSummary>(`/runs/${runBId}`),
          api<{ url: string }>(`/runs/${runBId}/preview-link`),
        ]);
        if (!mounted) return;
        setRunB(detail);
        setPreviewB(prev.url);
      } catch {
        // ignore
      }
    }
    fetchB();
    return () => {
      mounted = false;
    };
  }, [runBId]);

  return (
    <div className="flex flex-col gap-6 max-w-[1720px] mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/gallery")}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
              <GitCompare className="w-6 h-6 text-sky-400" />
              <span>左右双屏盲测与作品对比 (Compare Arena)</span>
            </h1>
            <p className="text-xs text-slate-400">
              同台竞技：观察不同大模型在同一或不同任务下的生成逻辑、交互流畅度与 Token 成本。
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setReloadKey((k) => k + 1)}
          icon={<RotateCw className="w-4 h-4" />}
        >
          同时刷新两侧画布
        </Button>
      </div>

      {/* Selectors Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left selector */}
        <Card className="p-4 bg-slate-900/90 border-sky-500/30">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
              参选作品 A (左侧)
            </span>
            <Select
              value={runAId}
              onChange={(e) => setRunAId(e.target.value)}
              options={runs.map((r) => ({
                value: r.id,
                label: `[${r.model}] ${r.title} (by ${r.username})`,
              }))}
            />
          </div>
        </Card>

        {/* Right selector */}
        <Card className="p-4 bg-slate-900/90 border-indigo-500/30">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              参选作品 B (右侧)
            </span>
            <Select
              value={runBId}
              onChange={(e) => setRunBId(e.target.value)}
              options={runs.map((r) => ({
                value: r.id,
                label: `[${r.model}] ${r.title} (by ${r.username})`,
              }))}
            />
          </div>
        </Card>
      </div>

      {/* Side-by-side Metrics Comparison Table */}
      <Card className="p-6 bg-slate-950/80 border border-slate-800">
        <div className="grid grid-cols-3 gap-4 text-xs font-mono">
          <div className="text-slate-500 font-sans font-semibold">对比维度</div>
          <div className="font-bold text-sky-300">{runA?.model || "作品 A"}</div>
          <div className="font-bold text-indigo-300">{runB?.model || "作品 B"}</div>

          {/* Row: Challenge */}
          <div className="text-slate-400 py-1.5 border-t border-slate-900">题目名称</div>
          <div className="text-slate-200 py-1.5 border-t border-slate-900 font-sans font-medium truncate">
            {runA?.title || "—"}
          </div>
          <div className="text-slate-200 py-1.5 border-t border-slate-900 font-sans font-medium truncate">
            {runB?.title || "—"}
          </div>

          {/* Row: Model Badge */}
          <div className="text-slate-400 py-1.5 border-t border-slate-900">驱动大模型</div>
          <div className="py-1.5 border-t border-slate-900">
            {runA ? <VendorBadge name={runA.model} label={runA.model} /> : "—"}
          </div>
          <div className="py-1.5 border-t border-slate-900">
            {runB ? <VendorBadge name={runB.model} label={runB.model} /> : "—"}
          </div>

          {/* Row: Elapsed */}
          <div className="text-slate-400 py-1.5 border-t border-slate-900">执行耗时</div>
          <div className="text-slate-200 py-1.5 border-t border-slate-900">
            {runA?.metrics?.elapsed_ms ? `${(runA.metrics.elapsed_ms / 1000).toFixed(1)}s` : "—"}
          </div>
          <div className="text-slate-200 py-1.5 border-t border-slate-900">
            {runB?.metrics?.elapsed_ms ? `${(runB.metrics.elapsed_ms / 1000).toFixed(1)}s` : "—"}
          </div>

          {/* Row: Token total */}
          <div className="text-slate-400 py-1.5 border-t border-slate-900">消耗 Token</div>
          <div className="text-sky-400 py-1.5 border-t border-slate-900 font-bold">
            {runA?.metrics?.tokens?.total ? runA.metrics.tokens.total.toLocaleString() : "—"}
          </div>
          <div className="text-indigo-400 py-1.5 border-t border-slate-900 font-bold">
            {runB?.metrics?.tokens?.total ? runB.metrics.tokens.total.toLocaleString() : "—"}
          </div>

          {/* Row: Votes */}
          <div className="text-slate-400 py-1.5 border-t border-slate-900">社区能力 / 趣味分</div>
          <div className="text-slate-200 py-1.5 border-t border-slate-900 flex items-center gap-3">
            <span className="text-sky-400">👍 {runA?.capability ?? 0}</span>
            <span className="text-amber-400">😄 {runA?.funny ?? 0}</span>
          </div>
          <div className="text-slate-200 py-1.5 border-t border-slate-900 flex items-center gap-3">
            <span className="text-sky-400">👍 {runB?.capability ?? 0}</span>
            <span className="text-amber-400">😄 {runB?.funny ?? 0}</span>
          </div>
        </div>
      </Card>

      {/* Side-by-side Live Iframes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
        {/* Iframe A */}
        <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center">
          {previewA ? (
            <iframe
              key={`a-${reloadKey}`}
              src={previewA}
              title="Preview A"
              sandbox="allow-scripts allow-forms allow-same-origin"
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <span className="text-xs text-slate-500">作品 A 未生成沙箱预览</span>
          )}
          <div className="absolute top-3 left-3 pointer-events-none">
            <Badge variant="brand">作品 A</Badge>
          </div>
        </div>

        {/* Iframe B */}
        <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center">
          {previewB ? (
            <iframe
              key={`b-${reloadKey}`}
              src={previewB}
              title="Preview B"
              sandbox="allow-scripts allow-forms allow-same-origin"
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <span className="text-xs text-slate-500">作品 B 未生成沙箱预览</span>
          )}
          <div className="absolute top-3 left-3 pointer-events-none">
            <Badge variant="purple">作品 B</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
