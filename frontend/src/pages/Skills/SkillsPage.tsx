import React, { useEffect, useState, useRef } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { SkillItem } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Dialog } from "../../components/ui/Dialog";
import {
  Puzzle,
  Plus,
  Trash2,
  Upload,
  FileCode,
  Layers,
  FileArchive,
} from "lucide-react";

export function SkillsPage() {
  const { showToast, user, openAuthModal } = useApp();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Upload fields
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const res = await api<SkillItem[]>("/skills");
      setSkills(res || []);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadSkills();
    else setLoading(false);
  }, [user]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      showToast("请先选择要上传的 SKILL.md 或包含它的 ZIP 压缩包", "warning");
      return;
    }
    if (file.size > 256 * 1024) {
      showToast("Skill 文件不能超过 256 KB 限制", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("file", file);

      await fetch("/api/skills", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      showToast("Skill 扩展包上传成功！", "success");
      setAddModalOpen(false);
      setName("");
      setFile(null);
      await loadSkills();
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此 Skill 扩展包吗？")) return;
    try {
      await api(`/skills/${id}`, { method: "DELETE" });
      showToast("Skill 已删除", "info");
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      showToast(errorText(err), "error");
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-16 max-w-md mx-auto text-center gap-4">
        <Puzzle className="w-12 h-12 text-slate-600" />
        <h2 className="text-xl font-bold text-slate-100">请先登录创作者账号</h2>
        <Button onClick={() => openAuthModal("login")}>立即登录</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-sky-400" />
            <span>Skill 扩展库 (Agent Extensions)</span>
          </h1>
          <p className="text-xs text-slate-400">
            上传专有工具定义与指导文档 (SKILL.md 或 ZIP 包)。智能体将在沙箱构建前挂载并阅读。
          </p>
        </div>

        <Button
          variant="glow"
          onClick={() => setAddModalOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          上传新 Skill
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-900/40 border border-slate-800 animate-shimmer" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center flex flex-col items-center gap-3">
          <p className="text-sm text-slate-400">暂无 Skill 扩展</p>
          <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
            上传第一个 Skill
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {skills.map((s) => (
            <Card key={s.id} className="p-6 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Puzzle className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-100">{s.name}</span>
                    <Badge variant="brand" size="sm">v{s.current_revision}</Badge>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    上传时间: {new Date(s.created * 1000).toLocaleDateString()} · 包含 {s.revisions?.length || 1} 个历史版本
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDelete(s.id)}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="删除 Skill"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="上传新 Skill 扩展包"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleUpload} className="flex flex-col gap-4 mt-2">
          <Input
            label="Skill 标识名称"
            required
            placeholder="如：tailwind-helper / canvas-particles"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">选择文件 (支持 .md 或 .zip，最大 256KB)</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-6 border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl bg-slate-950 flex flex-col items-center gap-2 cursor-pointer transition-colors"
            >
              <Upload className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-300">
                {file ? file.name : "点击选择 SKILL.md 或 ZIP 归档"}
              </span>
              <span className="text-[10px] text-slate-500">根目录必须包含 SKILL.md</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.zip"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddModalOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={submitting} variant="glow">
              确认上传
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
