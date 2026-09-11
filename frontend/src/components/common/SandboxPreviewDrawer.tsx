import React, { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import { VendorBadge } from "./VendorIcon";
import {
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  ExternalLink,
  ThumbsUp,
  Smile,
  Code2,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface SandboxPreviewDrawerProps {
  runId: string | null;
  title?: string;
  model?: string;
  onClose: () => void;
  onVoteSuccess?: () => void;
}

export function SandboxPreviewDrawer({
  runId,
  title,
  model,
  onClose,
  onVoteSuccess,
}: SandboxPreviewDrawerProps) {
  const { showToast, user, openAuthModal, navigate } = useApp();
  const [fullscreen, setFullscreen] = useState(false);
  const [key, setKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);

  useEffect(() => {
    if (runId) {
      setLoading(true);
      setKey((prev) => prev + 1);
    }
  }, [runId]);

  if (!runId) return null;

  const handleVote = async (type: "capability" | "funny") => {
    if (!user) {
      showToast("请先登录账号再参与社区投票", "warning");
      openAuthModal("login");
      return;
    }
    setVoting(type);
    try {
      await api(`/runs/${runId}/vote`, {
        method: "PUT",
        body: JSON.stringify({ kind: type, active: true }),
      });
      showToast(`已成功为作品投票 (${type === "capability" ? "能力分 +1" : "趣味分 +1"})`, "success");
      onVoteSuccess?.();
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setVoting(null);
    }
  };

  const iframeSrc = `/api/runs/${runId}/preview`;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative h-full flex flex-col bg-white shadow-2xl border-l border-slate-200/90 transition-all duration-300 ${
          fullscreen ? "w-full" : "w-full max-w-4xl"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900 truncate">
                  {title || "沙箱交互运行"}
                </span>
                {model && <VendorBadge model={model} />}
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>gVisor 独立虚拟沙箱环境 · 实时渲染</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Refresh */}
            <button
              onClick={() => {
                setLoading(true);
                setKey((prev) => prev + 1);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="重新加载沙箱"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Toggle Fullscreen */}
            <button
              onClick={() => setFullscreen((prev) => !prev)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title={fullscreen ? "还原窗口" : "最大化全屏"}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Open in new tab */}
            <button
              onClick={() => window.open(iframeSrc, "_blank")}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="新标签页打开原始网页"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
              title="关闭抽屉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sandbox Iframe Body */}
        <div className="relative flex-1 bg-slate-100 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 z-10">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="text-xs font-medium text-slate-500">正在启动独立沙箱并装载代码...</span>
            </div>
          )}

          <iframe
            key={key}
            src={iframeSrc}
            sandbox="allow-scripts"
            onLoad={() => setLoading(false)}
            className="w-full h-full border-none bg-white"
            title="Live Sandbox Execution"
          />
        </div>

        {/* Drawer Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote("capability")}
              disabled={Boolean(voting)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-800 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <ThumbsUp className="w-3.5 h-3.5 text-amber-500" />
              <span>能力赞赏 +1</span>
            </button>

            <button
              onClick={() => handleVote("funny")}
              disabled={Boolean(voting)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-800 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Smile className="w-3.5 h-3.5 text-rose-500" />
              <span>趣味脑洞 +1</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                navigate(`/run/${runId}`);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>查看源码与详细报告</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
