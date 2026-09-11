import React, { useEffect, useState, useRef } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ChallengeDetail } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Input";
import { Dialog } from "../../components/ui/Dialog";
import {
  ArrowLeft,
  Sparkles,
  Edit,
  History,
  CheckCircle2,
  FileCode,
  Layers,
  Upload,
  Camera,
  Image as ImageIcon,
} from "lucide-react";

export function ChallengePage() {
  const { path, navigate, showToast, user } = useApp();
  const challengeId = path.split("/")[2];

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);

  // New Version Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newRubric, setNewRubric] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Art Upload Modal state
  const [artModalOpen, setArtModalOpen] = useState(false);
  const [pendingArt, setPendingArt] = useState<string>("");
  const [savingArt, setSavingArt] = useState(false);
  const artFileRef = useRef<HTMLInputElement | null>(null);

  const loadChallenge = async () => {
    try {
      setLoading(true);
      const res = await api<ChallengeDetail>(`/challenges/${challengeId}`);
      setChallenge(res);
      if (res.versions?.length > 0) {
        setSelectedVersionNum(res.current_version);
        const cur = res.versions.find((v) => v.number === res.current_version);
        if (cur) {
          setNewPrompt(cur.prompt);
          setNewRubric(cur.rubric);
        }
      }
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (challengeId) loadChallenge();
  }, [challengeId]);

  const handleUpdateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(`/challenges/${challengeId}/versions`, {
        method: "POST",
        body: JSON.stringify({ prompt: newPrompt, rubric: newRubric }),
      });
      showToast("新版本发布成功！", "success");
      setEditModalOpen(false);
      await loadChallenge();
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArtFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("插画图片大小不能超过 2MB", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setPendingArt(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveArt = async () => {
    if (!pendingArt) return;
    setSavingArt(true);
    try {
      await api(`/challenges/${challengeId}/art`, {
        method: "PUT",
        body: JSON.stringify({ art: pendingArt }),
      });
      showToast("题目主题插画已成功更新！", "success");
      setChallenge((prev) => (prev ? { ...prev, art: pendingArt } : prev));
      setArtModalOpen(false);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSavingArt(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full h-80 rounded-2xl bg-white border border-slate-200 animate-pulse" />
    );
  }

  if (!challenge) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="text-slate-500 mb-4 text-sm">挑战题目不存在或已被撤下</p>
        <Button onClick={() => navigate("/explore")}>返回探索大厅</Button>
      </div>
    );
  }

  const activeVersion =
    challenge.versions.find((v) => v.number === selectedVersionNum) ||
    challenge.versions[0];

  const canEdit = Boolean(challenge.can_edit || user?.role === "admin");

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/explore")}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回挑战列表</span>
        </button>

        <div className="flex items-center gap-2.5">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingArt(challenge.art || "");
                setArtModalOpen(true);
              }}
              icon={<Camera className="w-3.5 h-3.5 text-blue-600" />}
            >
              更换插画
            </Button>
          )}

          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditModalOpen(true)}
              icon={<Edit className="w-3.5 h-3.5" />}
            >
              更新版本
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              navigate(
                `/studio?challenge_id=${challenge.id}&version_id=${activeVersion?.id}`
              )
            }
            icon={<Sparkles className="w-3.5 h-3.5 text-amber-300" />}
          >
            以此题开启实验
          </Button>
        </div>
      </div>

      {/* Main Info Card */}
      <Card className="p-6 sm:p-8 bg-white/90 border-slate-200/90 shadow-sm backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="brand">{challenge.category || "综合赛道"}</Badge>
              <Badge variant="neutral">当前版本 v{challenge.current_version}</Badge>
              {challenge.archived && <Badge variant="warning">已归档</Badge>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {challenge.title}
            </h1>
            <p className="text-slate-600 text-sm max-w-2xl leading-relaxed">
              {challenge.description || "暂无题目描述"}
            </p>
          </div>

          {/* Art Cover Preview with Edit Hover Button */}
          <div className="group relative shrink-0 flex items-center justify-center p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-inner overflow-hidden">
            <img
              src={challenge.art || "/art/challenge-pelican.svg"}
              alt={challenge.title}
              className="w-28 h-28 object-contain transition-transform duration-300 group-hover:scale-105"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setPendingArt(challenge.art || "");
                  setArtModalOpen(true);
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-[11px] font-bold cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                <span>更换插画</span>
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Version Tabs & Rubric */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Versions list */}
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span>题目版本历史 ({challenge.versions.length})</span>
          </h3>

          <div className="flex flex-col gap-1.5">
            {challenge.versions.map((ver) => {
              const isSelected =
                ver.number === (selectedVersionNum ?? challenge.current_version);
              return (
                <button
                  key={ver.id}
                  onClick={() => setSelectedVersionNum(ver.number)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white/80 border-slate-200/90 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-xs">版本 v{ver.number}</span>
                    <span
                      className={`text-[10px] font-mono mt-0.5 ${
                        isSelected ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      SHA: {ver.sha256.slice(0, 10)}...
                    </span>
                  </div>
                  {ver.number === challenge.current_version && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                      }`}
                    >
                      最新当前版
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Version Prompt & Rubric Preview */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Prompt Box */}
          <Card className="p-5 flex flex-col gap-2.5 bg-white/90 border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-blue-600" />
                <span>智能体提示词 (System Prompt) · v{activeVersion?.number}</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {activeVersion?.prompt.length} 字符
              </span>
            </div>
            <pre className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
              {activeVersion?.prompt}
            </pre>
          </Card>

          {/* Rubric Box */}
          <Card className="p-5 flex flex-col gap-2.5 bg-white/90 border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>评审要点与验收标准 (Rubric)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {activeVersion?.rubric.length} 字符
              </span>
            </div>
            <pre className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
              {activeVersion?.rubric}
            </pre>
          </Card>
        </div>
      </div>

      {/* Edit Version Dialog */}
      <Dialog
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`发布新版本 (将在 v${challenge.current_version} 基础上递增)`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleUpdateVersion} className="flex flex-col gap-4 mt-1">
          <Textarea
            label="更新后的 System Prompt"
            required
            rows={7}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
          />

          <Textarea
            label="更新后的 Rubric 验收标准"
            required
            rows={5}
            value={newRubric}
            onChange={(e) => setNewRubric(e.target.value)}
          />

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditModalOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={submitting} variant="primary" size="sm">
              确认发布新版本
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Art Upload Dialog */}
      <Dialog
        open={artModalOpen}
        onClose={() => setArtModalOpen(false)}
        title="更换题目主题插画封面"
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col gap-4 mt-2">
          {/* Image Preview */}
          <div className="relative aspect-16/10 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center p-4">
            {pendingArt ? (
              <img
                src={pendingArt}
                alt="Art preview"
                className="w-full h-full object-contain filter drop-shadow-xs"
              />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-slate-400 text-xs">
                <ImageIcon className="w-8 h-8 opacity-40" />
                <span>暂未载入新插画</span>
              </div>
            )}
          </div>

          {/* Upload trigger */}
          <div
            onClick={() => artFileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/20 transition-all cursor-pointer text-center"
          >
            <Upload className="w-6 h-6 text-slate-400" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-700">点击选择本地插画文件</span>
              <span className="text-[10px] text-slate-400">
                支持 SVG、PNG、JPG、WebP (建议不超过 2MB)
              </span>
            </div>
            <input
              ref={artFileRef}
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleArtFileSelect}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setArtModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={savingArt}
              disabled={!pendingArt || pendingArt === challenge.art}
              onClick={handleSaveArt}
            >
              确认保存插画
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
