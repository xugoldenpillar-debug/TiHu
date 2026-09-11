import React, { useEffect, useState, useRef, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { RunDetail } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { VendorBadge } from "../../components/common/VendorIcon";
import {
  Sparkles,
  Terminal,
  Code2,
  Play,
  RotateCw,
  ExternalLink,
  GitCompare,
  Share2,
  Copy,
  Check,
  Ban,
  ThumbsUp,
  Smile,
  AlertCircle,
  FileText,
} from "lucide-react";

export function RunPage({ id }: { id: string }) {
  const { navigate, showToast, user, refreshSession } = useApp();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "events">("preview");

  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string>("index.html");
  const [copied, setCopied] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const pollTimerRef = useRef<number | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      const data = await api<RunDetail>(`/runs/${id}`);
      setRun(data);

      if (data.status === "succeeded" || data.status === "finished") {
        try {
          const [sourceRes, previewRes] = await Promise.all([
            api<{ files: Record<string, string> }>(`/runs/${id}/source`),
            api<{ url: string }>(`/runs/${id}/preview-link`),
          ]);
          setArtifacts(sourceRes.files || {});
          if (!selectedFile && Object.keys(sourceRes.files || {}).length) {
            setSelectedFile(Object.keys(sourceRes.files)[0]);
          }
          setPreviewUrl(previewRes.url);
        } catch {
          // ignore
        }
      }

      return data.status;
    } catch (err) {
      showToast(errorText(err), "error");
      return "failed";
    } finally {
      setLoading(false);
    }
  }, [id, selectedFile, showToast]);

  useEffect(() => {
    let active = true;

    async function tick() {
      const status = await fetchRun();
      if (!active) return;
      if (status === "queued" || status === "running") {
        pollTimerRef.current = window.setTimeout(tick, 2500);
      }
    }

    tick();

    return () => {
      active = false;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchRun]);

  const handleCancel = async () => {
    try {
      await api(`/runs/${id}/cancel`, { method: "POST" });
      showToast("实验已取消", "info");
      await fetchRun();
      await refreshSession();
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  const handlePublish = async (publish: boolean) => {
    try {
      await api(`/runs/${id}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
      showToast(publish ? "作品已公开发布至画廊！" : "已将作品撤下为私有", "success");
      await fetchRun();
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  const handleVote = async (type: "capability" | "funny") => {
    if (!user) {
      showToast("请先登录再进行投票", "warning");
      return;
    }
    try {
      await api(`/runs/${id}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote_type: type }),
      });
      showToast(`投票成功 (${type === "capability" ? "能力分" : "趣味分"})`, "success");
      await fetchRun();
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  const handleCopyCode = () => {
    const code = artifacts[selectedFile] || "";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast("代码已复制到剪贴板", "info");
  };

  if (loading && !run) {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full h-[600px] rounded-3xl bg-white border border-slate-200 animate-pulse" />
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center gap-3">
        <p className="text-slate-500 text-sm">实验记录不存在或无权访问</p>
        <Button onClick={() => navigate("/studio")}>返回实验室</Button>
      </div>
    );
  }

  const isRunning = run.status === "queued" || run.status === "running";
  const isSucceeded = run.status === "succeeded" || run.status === "finished";

  return (
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto w-full pb-16 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">
              {run.title}
            </h1>
            <span className="text-xs font-mono text-slate-400">v{run.version}</span>
            <VendorBadge name={run.model} label={run.model} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>创作者: <strong className="text-slate-800 font-medium">{run.username}</strong></span>
            <span>·</span>
            <span>赛道: {run.track || "通用"}</span>
            <span>·</span>
            <span>创建时间: {new Date(run.created * 1000).toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isRunning && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-ping" />
              <span>{run.status === "queued" ? "排队调度中..." : "智能体编码中..."}</span>
            </div>
          )}

          {isSucceeded && (
            <Badge variant="success" size="md">
              ✓ 执行完成
            </Badge>
          )}

          {run.status === "failed" && (
            <Badge variant="danger" size="md">
              ✕ 实验中断
            </Badge>
          )}

          {run.status === "canceled" && (
            <Badge variant="warning" size="md">
              已取消
            </Badge>
          )}

          {isRunning && run.can_manage && (
            <Button variant="danger" size="sm" onClick={handleCancel} icon={<Ban className="w-3.5 h-3.5" />}>
              取消运行
            </Button>
          )}

          {isSucceeded && (
            <div className="flex items-center gap-2">
              {run.can_manage && (
                <Button
                  variant={run.published ? "outline" : "primary"}
                  size="sm"
                  onClick={() => handlePublish(!run.published)}
                  icon={<Share2 className="w-3.5 h-3.5" />}
                >
                  {run.published ? "撤下作品" : "公开发布"}
                </Button>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/compare?a=${run.id}`)}
                icon={<GitCompare className="w-3.5 h-3.5" />}
              >
                对比作品
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col gap-0.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400">执行耗时</span>
          <span className="text-base font-bold text-slate-900 font-mono">
            {run.metrics?.elapsed_ms ? `${(run.metrics.elapsed_ms / 1000).toFixed(1)}s` : isRunning ? "计时中..." : "—"}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col gap-0.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400">模型请求次数</span>
          <span className="text-base font-bold text-slate-900 font-mono">
            {run.metrics?.calls ?? (isRunning ? "0" : "—")} 次
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col gap-0.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400">Token 消耗</span>
          <span className="text-base font-bold text-slate-900 font-mono">
            {run.metrics?.tokens?.total ? run.metrics.tokens.total.toLocaleString() : "计算中"}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col gap-0.5 shadow-xs">
          <span className="text-[11px] font-medium text-slate-400">社区评分</span>
          <div className="flex items-center gap-3 text-xs font-semibold pt-0.5">
            <span className="text-sky-700 flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5" /> {run.capability}
            </span>
            <span className="text-amber-700 flex items-center gap-1">
              <Smile className="w-3.5 h-3.5" /> {run.funny}
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace Tabs */}
      <div className="flex flex-col gap-3">
        {/* Tab switcher */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              onClick={() => setActiveTab("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "preview"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>沙箱实时预览</span>
            </button>

            <button
              onClick={() => setActiveTab("code")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "code"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>生成产物源码 ({Object.keys(artifacts).length || 0})</span>
            </button>

            <button
              onClick={() => setActiveTab("events")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "events"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>智能体事件审计</span>
            </button>
          </div>

          {activeTab === "preview" && previewUrl && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                title="重新加载预览"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-xs"
              >
                <span>新窗口全屏打开</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {activeTab === "code" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyCode}
              icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? "已复制" : "复制代码"}
            </Button>
          )}
        </div>

        {/* Tab 1: Preview */}
        {activeTab === "preview" && (
          <div className="relative w-full h-[620px] rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-xs flex items-center justify-center">
            {previewUrl ? (
              <iframe
                key={iframeKey}
                src={previewUrl}
                title="Sandbox Preview"
                sandbox="allow-scripts allow-forms allow-same-origin"
                className="w-full h-full border-0 bg-white"
              />
            ) : isRunning ? (
              <div className="flex flex-col items-center gap-3 text-center p-8">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
                  <Sparkles className="w-5 h-5 animate-spin text-sky-600" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">智能体正在构建前端产物...</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  pi 0.85.1 正在受限安全沙箱中编写自包含网页。完成后将在此处加载渲染。
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <AlertCircle className="w-6 h-6" />
                <p className="text-xs">该实验未生成有效的 Web 产物或已被撤销</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Code Viewer */}
        {activeTab === "code" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[620px]">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-1.5 overflow-y-auto shadow-xs">
              <span className="text-xs font-semibold text-slate-400 px-2">
                产物文件列表
              </span>
              {Object.keys(artifacts).length === 0 ? (
                <p className="text-xs text-slate-400 px-2 mt-1">暂无生成文件</p>
              ) : (
                Object.keys(artifacts).map((path) => (
                  <button
                    key={path}
                    onClick={() => setSelectedFile(path)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono text-left transition-all cursor-pointer ${
                      selectedFile === path
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{path}</span>
                  </button>
                ))
              )}
            </div>

            <div className="md:col-span-3 rounded-2xl bg-white border border-slate-200 p-4 flex flex-col gap-2 overflow-hidden shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-mono text-slate-500">
                <span>{selectedFile}</span>
                <span>{artifacts[selectedFile]?.length || 0} 字节</span>
              </div>
              <pre className="flex-1 p-3 overflow-auto font-mono text-xs text-slate-800 leading-relaxed bg-slate-50 border border-slate-200/80 rounded-xl">
                {artifacts[selectedFile] || "// 暂无内容"}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 3: Events Log */}
        {activeTab === "events" && (
          <div className="p-5 rounded-2xl bg-white border border-slate-200 h-[620px] flex flex-col gap-3 font-mono text-xs overflow-y-auto shadow-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-600">
              <Terminal className="w-4 h-4 text-sky-600" />
              <span>智能体执行过程审计日志 (Read-only Stream)</span>
            </div>

            {run.events?.length ? (
              run.events.map((e, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-bold text-slate-800">[{e.kind}]</span>
                    <span>{new Date(e.time * 1000).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {e.text || JSON.stringify(e.data)}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                {isRunning ? "正在等待首个执行事件..." : "暂无审计日志记录"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Community Voting Area */}
      {isSucceeded && (
        <Card className="p-5 bg-white border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 text-center sm:text-left">
            <h3 className="text-sm font-bold text-slate-900">为这个作品投下你的一票</h3>
            <p className="text-xs text-slate-500">
              社区投票将计入模型 Elo 天梯能力榜单与趣味榜单。
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleVote("capability")}
              icon={<ThumbsUp className="w-3.5 h-3.5" />}
            >
              能力表现卓越 ({run.capability})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleVote("funny")}
              icon={<Smile className="w-3.5 h-3.5 text-amber-500" />}
            >
              脑洞与趣味 ({run.funny})
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
