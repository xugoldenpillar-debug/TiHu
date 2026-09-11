import React, { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type {
  Challenge,
  ChallengeDetail,
  ConnectionItem,
  PromptItem,
  SkillItem,
  PageResult,
} from "../../types";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Select, Textarea } from "../../components/ui/Input";
import { VendorIcon, VendorBadge } from "../../components/common/VendorIcon";
import {
  Sparkles,
  Zap,
  Key,
  Puzzle,
  FileText,
  AlertTriangle,
  ArrowRight,
  Plus,
  ShieldAlert,
  Cpu,
} from "lucide-react";

export function StudioPage() {
  const { navigate, showToast, user, quota, openAuthModal, refreshSession } = useApp();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("");
  const [selectedChallengeDetail, setSelectedChallengeDetail] = useState<ChallengeDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");

  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);

  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Initialize from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qChallenge = params.get("challenge_id");
    const qVersion = params.get("version_id");
    if (qChallenge) setSelectedChallengeId(qChallenge);
    if (qVersion) setSelectedVersionId(qVersion);
  }, []);

  // Fetch initial data
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [cRes, connRes, pRes, sRes] = await Promise.all([
          api<PageResult<Challenge>>("/challenges?limit=50"),
          api<ConnectionItem[]>("/connections"),
          api<PromptItem[]>("/prompts"),
          api<SkillItem[]>("/skills"),
        ]);

        if (!mounted) return;
        setChallenges(cRes.items || []);
        setConnections(connRes || []);
        setPrompts(pRes || []);
        setSkills(sRes || []);

        // Defaults
        if (!selectedChallengeId && cRes.items?.length) {
          setSelectedChallengeId(cRes.items[0].id);
        }
        if (connRes?.length) {
          setSelectedConnectionId(connRes[0].id);
          if (connRes[0].models?.length) {
            setSelectedModel(connRes[0].models[0]);
          }
        }
      } catch (err) {
        if (mounted) showToast(errorText(err), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [user, showToast]);

  // Load challenge detail when challenge changed
  useEffect(() => {
    if (!selectedChallengeId) return;
    let mounted = true;
    async function loadDetail() {
      try {
        const detail = await api<ChallengeDetail>(`/challenges/${selectedChallengeId}`);
        if (!mounted) return;
        setSelectedChallengeDetail(detail);
        if (!selectedVersionId && detail.versions?.length) {
          setSelectedVersionId(detail.versions[0].id);
        }
      } catch {
        // ignore
      }
    }
    loadDetail();
    return () => {
      mounted = false;
    };
  }, [selectedChallengeId]);

  // Update models when connection changed
  const currentConn = connections.find((c) => c.id === selectedConnectionId);
  useEffect(() => {
    if (currentConn && currentConn.models?.length) {
      if (!currentConn.models.includes(selectedModel)) {
        setSelectedModel(currentConn.models[0]);
      }
    }
  }, [selectedConnectionId, currentConn]);

  const handleToggleSkill = (skillId: string) => {
    if (selectedSkillIds.includes(skillId)) {
      setSelectedSkillIds(selectedSkillIds.filter((id) => id !== skillId));
    } else {
      if (selectedSkillIds.length >= 4) {
        showToast("最多只可同时挂载 4 个 Skill 扩展", "warning");
        return;
      }
      setSelectedSkillIds([...selectedSkillIds, skillId]);
    }
  };

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal("login");
      return;
    }
    if (!selectedChallengeId || !selectedVersionId) {
      showToast("请选择要实验的挑战题目与版本", "warning");
      return;
    }
    if (!selectedConnectionId || !selectedModel) {
      showToast("请选择模型连接与目标大模型", "warning");
      return;
    }
    if (!consent) {
      showToast("请确认已了解 API Key 可能产生费用", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        challenge_id: selectedChallengeId,
        version_id: selectedVersionId,
        connection_id: selectedConnectionId,
        model: selectedModel,
        skill_ids: selectedSkillIds,
      };
      if (selectedPromptId) payload.prompt_id = selectedPromptId;

      const res = await api<{ id: string }>("/runs", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      showToast("实验已成功入队，正在初始化独立沙箱...", "success");
      await refreshSession();
      navigate(`/run/${res.id}`);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-16 max-w-lg mx-auto text-center gap-4 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">请先登录创作者账号</h2>
        <p className="text-sm text-slate-400">
          TiHu 采用 BYOK (Bring Your Own Key) 模式，所有代码由智能体在隔离的 gVisor 沙箱中运行。
        </p>
        <Button variant="glow" onClick={() => openAuthModal("login")} className="mt-2">
          立即登录 / 注册
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            模型实验室 (Studio)
          </h1>
          <Badge variant="brand">BYOK 编码智能体</Badge>
        </div>
        <p className="text-slate-400 text-sm">
          配置运行参数，挂载前沿 Prompt 模板与 Skill 插件，启动专属于你的 pi 0.85.1 编码实验。
        </p>
      </div>

      {/* Quota Notice Banner */}
      {quota && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-300">
              当前运行并发: <strong className="text-slate-100">{quota.active}</strong> / {quota.active_limit} ·
              24小时剩余额度: <strong className="text-slate-100">{quota.daily_remaining}</strong> / {quota.daily_limit}
            </span>
          </div>
          {quota.daily_remaining <= 0 && (
            <span className="text-rose-400 font-semibold">今日额度已满，请等待恢复</span>
          )}
        </div>
      )}

      <form onSubmit={handleStartRun} className="flex flex-col gap-8">
        {/* Step 1: Challenge selection */}
        <Card className="p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs">
              1
            </span>
            <h2 className="text-base font-bold text-slate-100">选择挑战题目与版本</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="选择目标题目"
              value={selectedChallengeId}
              onChange={(e) => {
                setSelectedChallengeId(e.target.value);
                setSelectedVersionId("");
              }}
              options={challenges.map((c) => ({
                value: c.id,
                label: `${c.title} (${c.category})`,
              }))}
            />

            {selectedChallengeDetail && (
              <Select
                label="选择题目版本"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                options={selectedChallengeDetail.versions.map((v) => ({
                  value: v.id,
                  label: `版本 v${v.number} (${v.sha256.slice(0, 8)})`,
                }))}
              />
            )}
          </div>

          {selectedChallengeDetail && (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex flex-col gap-2">
              <span className="font-semibold text-slate-300">任务提示词预览:</span>
              <p className="font-mono text-slate-400 line-clamp-3 leading-relaxed">
                {selectedChallengeDetail.versions.find((v) => v.id === selectedVersionId)?.prompt ||
                  selectedChallengeDetail.description}
              </p>
            </div>
          )}
        </Card>

        {/* Step 2: Model & Connection */}
        <Card className="p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs">
                2
              </span>
              <h2 className="text-base font-bold text-slate-100">连接配置与模型选择</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/connections")}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>管理/添加连接</span>
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-xs text-amber-200">
                尚未配置任何 API 连接。TiHu 不存储你的明文 Key，由受信任 Worker 仅在内存中解密代理。
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => navigate("/connections")}
              >
                前往添加 API Key 连接
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="已绑定的连接凭据"
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                options={connections.map((c) => ({
                  value: c.id,
                  label: `${c.provider.toUpperCase()} (${c.base_url || "默认端点"})`,
                }))}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300 tracking-wide">
                  选择大模型 (已同步列表)
                </label>
                {currentConn?.models?.length ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        options={currentConn.models.map((m) => ({ value: m, label: m }))}
                      />
                    </div>
                    <div className="shrink-0 p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center">
                      <VendorIcon name={selectedModel} size={20} />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-2.5">
                    该连接未检测到可用模型，请在 API 连接页刷新模型列表。
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Step 3: Optional Skill and Prompt templates */}
        <Card className="p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-xs">
              3
            </span>
            <h2 className="text-base font-bold text-slate-100">
              增强插件与自定义 Prompt (可选)
            </h2>
          </div>

          {/* Prompt template */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                注入自定义前置提示词 (Prompt Template)
              </label>
              <button
                type="button"
                onClick={() => navigate("/prompts")}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                管理模板
              </button>
            </div>
            <Select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              options={[
                { value: "", label: "默认 (不附加额外私有模板)" },
                ...prompts.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>

          {/* Skill Bundles */}
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                挂载 Skill 扩展包 (最多选择 4 个)
              </label>
              <button
                type="button"
                onClick={() => navigate("/skills")}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                上传新 Skill
              </button>
            </div>

            {skills.length === 0 ? (
              <p className="text-xs text-slate-500">暂无可挂载的 Skill 扩展。</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {skills.map((s) => {
                  const selected = selectedSkillIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleToggleSkill(s.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        selected
                          ? "bg-sky-500/15 border-sky-500/60 text-sky-200"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Puzzle className={`w-4 h-4 ${selected ? "text-sky-400" : "text-slate-500"}`} />
                        <span className="text-xs font-semibold text-slate-200">{s.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">v{s.current_revision}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Consent & Submit */}
        <Card className="p-6 sm:p-8 bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-slate-800 flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 w-4 h-4 rounded text-sky-500 focus:ring-sky-500/40 bg-slate-950 border-slate-800"
            />
            <div className="flex flex-col text-xs leading-relaxed">
              <span className="font-semibold text-slate-200">
                我理解本次实验将在真实大模型服务商上发起 API 请求并可能产生费用
              </span>
              <span className="text-slate-400">
                运行采用零重试策略，遇错不会自动重复计费。生成的交互产物归创作者所有。
              </span>
            </div>
          </label>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="lg"
              variant="glow"
              loading={submitting}
              disabled={!consent || !connections.length}
              icon={<Sparkles className="w-4 h-4" />}
            >
              启动智能体实验
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
