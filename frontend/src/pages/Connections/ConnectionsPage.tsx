import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ConnectionItem } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { Dialog } from "../../components/ui/Dialog";
import { VendorIcon, VendorBadge } from "../../components/common/VendorIcon";
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  Cpu,
  Lock,
} from "lucide-react";

export function ConnectionsPage() {
  const { showToast, user, openAuthModal, config } = useApp();
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form fields
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const availableProviders = config?.providers?.length
    ? config.providers
    : ["openai", "anthropic", "gemini", "deepseek", "groq", "ollama", "mistral", "meta"];

  const loadConnections = async () => {
    try {
      setLoading(true);
      const res = await api<ConnectionItem[]>("/connections");
      setConnections(res || []);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadConnections();
    else setLoading(false);
  }, [user]);

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/connections", {
        method: "POST",
        body: JSON.stringify({
          provider,
          base_url: baseUrl || undefined,
          api_key: apiKey,
        }),
      });
      showToast("API 连接创建成功并已加密存储！", "success");
      setAddModalOpen(false);
      setApiKey("");
      setBaseUrl("");
      await loadConnections();
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    if (!confirm("确定要解绑并删除此 API 连接凭据吗？相关的进行中实验可能被终止。")) return;
    try {
      await api(`/connections/${id}`, { method: "DELETE" });
      showToast("连接已安全撤销", "info");
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  const handleRefreshModels = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await api<{ models: string[] }>(`/connections/${id}/models`, {
        method: "POST",
      });
      showToast(`已成功同步并发现 ${res.models?.length || 0} 个可用模型`, "success");
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, models: res.models } : c))
      );
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setRefreshingId(null);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-16 max-w-md mx-auto text-center gap-4">
        <Key className="w-12 h-12 text-slate-600" />
        <h2 className="text-xl font-bold text-slate-100">请先登录创作者账号</h2>
        <Button onClick={() => openAuthModal("login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Key className="w-6 h-6 text-sky-400" />
            <span>API 连接管理 (BYOK Vault)</span>
          </h1>
          <p className="text-xs text-slate-400">
            绑定你自己的大模型 Provider 凭据。私钥全程经 AES-256-GCM 加密，仅在受信任 Worker 执行时解密。
          </p>
        </div>

        <Button
          variant="glow"
          onClick={() => setAddModalOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          添加新连接
        </Button>
      </div>

      {/* Security notice card */}
      <Card className="p-4 bg-sky-950/20 border-sky-500/30 flex items-center gap-3 text-xs text-sky-200">
        <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0" />
        <span>
          <strong>零明文持久化保障：</strong> 你的 API Key 永远不会暴露给网页端或执行沙箱环境中的 Agent。
          沙箱仅使用单次临时分配的 Unix-socket Broker Token 与受信网关通讯。
        </span>
      </Card>

      {/* Connections List */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-900/40 border border-slate-800 animate-shimmer" />
          ))}
        </div>
      ) : connections.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center flex flex-col items-center gap-3">
          <p className="text-sm text-slate-400">暂未添加任何模型连接</p>
          <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
            立即添加第一个连接
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {connections.map((c) => (
            <Card key={c.id} className="p-6 flex flex-col gap-4 bg-slate-900/80">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <VendorIcon name={c.provider} size={28} />
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-slate-100 uppercase tracking-wide">
                      {c.provider}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      端点: {c.base_url || "官方默认 Base URL"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={refreshingId === c.id}
                    onClick={() => handleRefreshModels(c.id)}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    刷新模型列表
                  </Button>
                  <button
                    onClick={() => handleDeleteConnection(c.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="解绑并删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Models list */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-400">
                  已发现的可用模型 ({c.models?.length || 0}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {c.models?.length ? (
                    c.models.map((m) => (
                      <span
                        key={m}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono"
                      >
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 italic">
                      未探测到模型，请点击右上角“刷新模型列表”探测。
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Dialog
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="绑定新的 Provider 连接"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddConnection} className="flex flex-col gap-4 mt-2">
          <Select
            label="服务商 (Provider)"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            options={availableProviders.map((p) => ({
              value: p,
              label: p.toUpperCase(),
            }))}
          />

          <Input
            label="自定义 Base URL (可选，保留空则使用官方地址)"
            placeholder="如：https://api.openai.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />

          <Input
            label="API Key (凭据私钥)"
            type="password"
            required
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddModalOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={submitting} variant="glow">
              加密存储并创建
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
