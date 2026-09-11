import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { ChallengeDetail } from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Input, Textarea } from "../../components/ui/Input";
import { Dialog } from "../../components/ui/Dialog";
import {
  ArrowLeft,
  Sparkles,
  Layers,
  FileCode,
  ShieldCheck,
  Edit,
  Flame,
  Clock,
  History,
} from "lucide-react";

export function ChallengePage({ id }: { id: string }) {
  const { navigate, showToast, user } = useApp();
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVersionNum, setSelectedVersionNum] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newRubric, setNewRubric] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const data = await api<ChallengeDetail>(`/challenges/${id}`);
        if (!mounted) return;
        setChallenge(data);
        setSelectedVersionNum(data.current_version);
        const cur = data.versions.find((v) => v.number === data.current_version);
        if (cur) {
          setNewPrompt(cur.prompt);
          setNewRubric(cur.rubric);
        }
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
  }, [id, showToast]);

  const activeVersion = challenge?.versions.find(
    (v) => v.number === (selectedVersionNum ?? challenge.current_version)
  );

  const handleUpdateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    try {
      await api(`/challenges/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ prompt: newPrompt, rubric: newRubric }),
      });
      showToast("题目新版本创建成功！", "success");
      setEditModalOpen(false);
      // Reload challenge detail
      const refreshed = await api<ChallengeDetail>(`/challenges/${id}`);
      setChallenge(refreshed);
      setSelectedVersionNum(refreshed.current_version);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full animate-shimmer h-96 rounded-2xl bg-slate-900/40 border border-slate-800" />
    );
  }

  if (!challenge) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="text-slate-400 mb-4">挑战题目不存在或已被撤下</p>
        <Button onClick={() => navigate("/explore")}>返回探索大厅</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/explore")}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回挑战列表</span>
        </button>

        <div className="flex items-center gap-3">
          {challenge.can_edit && (
            <Button
              variant="secondary"
              onClick={() => setEditModalOpen(true)}
              icon={<Edit className="w-4 h-4" />}
            >
              更新版本
            </Button>
          )}
          <Button
            variant="glow"
            onClick={() =>
              navigate(
                `/studio?challenge_id=${challenge.id}&version_id=${activeVersion?.id}`
              )
            }
            icon={<Sparkles className="w-4 h-4" />}
          >
            以此题发起实验
          </Button>
        </div>
      </div>

      {/* Main Info Card */}
      <Card className="p-6 sm:p-8 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/30">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Badge variant="brand">{challenge.category || "综合赛道"}</Badge>
              <Badge variant="neutral">当前 v{challenge.current_version}</Badge>
              {challenge.archived && <Badge variant="warning">已归档</Badge>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              {challenge.title}
            </h1>
            <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
              {challenge.description || "暂无题目描述"}
            </p>
          </div>

          <div className="shrink-0 flex items-center justify-center p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
            <img
              src={challenge.art || "/art/challenge-pelican.svg"}
              alt={challenge.title}
              className="w-28 h-28 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
      </Card>

      {/* Version Tabs & Rubric */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Versions list */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <History className="w-4 h-4 text-sky-400" />
            <span>题目版本历史 ({challenge.versions.length})</span>
          </h3>

          <div className="flex flex-col gap-2">
            {challenge.versions.map((ver) => {
              const isSelected =
                ver.number === (selectedVersionNum ?? challenge.current_version);
              return (
                <button
                  key={ver.id}
                  onClick={() => setSelectedVersionNum(ver.number)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/15 border-sky-500/40 text-sky-200 shadow-md"
                      : "bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">版本 v{ver.number}</span>
                    <span className="text-[11px] font-mono text-slate-500 truncate max-w-[180px]">
                      SHA: {ver.sha256.slice(0, 12)}...
                    </span>
                  </div>
                  {ver.number === challenge.current_version && (
                    <Badge variant="brand" size="sm">
                      最新
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Version Prompt & Evaluation Rubric */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-slate-200">
                  任务提示词 (Prompt · v{activeVersion?.number})
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                不可变快照 · 隔离评测
              </span>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {activeVersion?.prompt}
            </pre>
          </Card>

          <Card className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-200">
                  评分参考准则 (Rubric)
                </span>
              </div>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {activeVersion?.rubric || "无特殊评价准则，依据任务提示词综合考量。"}
            </pre>
          </Card>
        </div>
      </div>

      {/* Edit Version Dialog */}
      <Dialog
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`更新题目版本 (将创建 v${challenge.current_version + 1})`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleUpdateVersion} className="flex flex-col gap-4 mt-2">
          <Textarea
            label="新版本提示词 (Prompt)"
            required
            rows={5}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
          />
          <Textarea
            label="新版本评分准则 (Rubric)"
            rows={4}
            value={newRubric}
            onChange={(e) => setNewRubric(e.target.value)}
          />
          <div className="flex justify-end gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditModalOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" loading={submitting} variant="primary">
              确认提交新版本
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
