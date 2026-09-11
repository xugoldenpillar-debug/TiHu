import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { PromptItem } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Input";
import { Dialog } from "../../components/ui/Dialog";
import { FileText, Plus, Trash2 } from "lucide-react";

export function PromptsPage() {
  const { showToast, user, openAuthModal } = useApp();
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const res = await api<PromptItem[]>("/prompts");
      setPrompts(res || []);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadPrompts();
    else setLoading(false);
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/prompts", {
        method: "POST",
        body: JSON.stringify({ name, body }),
      });
      showToast("提示词模板保存成功！", "success");
      setModalOpen(false);
      setName("");
      setBody("");
      await loadPrompts();
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此提示词模板吗？")) return;
    try {
      await api(`/prompts/${id}`, { method: "DELETE" });
      showToast("模板已删除", "info");
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-16 max-w-md mx-auto text-center gap-3">
        <FileText className="w-10 h-10 text-slate-400" />
        <h2 className="text-xl font-bold text-slate-900">请先登录创作者账号</h2>
        <Button onClick={() => openAuthModal("login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-slate-700" />
            <span>私有提示词库 (Prompt Templates)</span>
          </h1>
          <p className="text-xs text-slate-500">
            预设并保存你常用的系统级提示词或引导原则，可在实验室中一键选用。
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setModalOpen(true)}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          新建模板
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center flex flex-col items-center gap-3 shadow-xs">
          <p className="text-xs text-slate-500">暂无私有提示词模板</p>
          <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
            创建第一个模板
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {prompts.map((p) => (
            <Card key={p.id} className="p-4 flex flex-col gap-2 bg-white border-slate-200">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-900">{p.name}</span>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <pre className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                {p.body}
              </pre>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="新建提示词模板"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-3.5 mt-1">
          <Input
            label="模板名称"
            required
            placeholder="如：极简设计原则 / 代码规范强化"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Textarea
            label="提示词正文"
            required
            rows={5}
            placeholder="输入你希望注入给 Agent 的提示词内容..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={submitting} variant="primary" size="sm">
              保存模板
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
