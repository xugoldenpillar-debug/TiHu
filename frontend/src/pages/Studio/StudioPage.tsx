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
import { Select } from "../../components/ui/Input";
import { VendorIcon } from "../../components/common/VendorIcon";
import {
  Sparkles,
  Zap,
  Puzzle,
  AlertTriangle,
  Plus,
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qChallenge = params.get("challenge_id");
    const qVersion = params.get("version_id");
    if (qChallenge) setSelectedChallengeId(qChallenge);
    if (qVersion) setSelectedVersionId(qVersion);
  }, []);

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
          api<ConnectionItem[]>("/keys"),
          api<PromptItem[]>("/prompts"),
          api<SkillItem[]>("/skills"),
        ]);

        if (!mounted) return;
        setChallenges(cRes.items || []);
        setConnections(connRes || []);
        setPrompts(pRes || []);
        setSkills(sRes || []);

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
        version_id: selectedVersionId,
        key_id: selectedConnectionId,
        model: selectedModel,
        prompt: prompts.find((p) => p.id === selectedPromptId)?.body || "",
        skill_ids: selectedSkillIds,
        consent,
      };

      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ??
        `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await api<{ id: string }>("/runs", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
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
      <div className="flex flex-col items-center justify-center p-16 max-w-md mx-auto text-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800">
          <Sparkles className="w-6 h-6 text-sky-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">请先登录创作者账号</h2>
        <p className="text-xs text-slate-500">
          TiHu 采用 BYOK (Bring Your Own Key) 模式，所有代码由智能体在隔离沙箱中运行。
        </p>
        <Button variant="primary" size="sm" onClick={() => openAuthModal("login")} className="mt-2">
          立即登录 / 注册
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full pb-16 animate-in fade-in duration-200">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            模型实验室 (Studio)
          </h1>
          <Badge variant="brand">BYOK 模式</Badge>
        </div>
        <p className="text-slate-500 text-xs">
          选择题目、连接你自己的模型，挂载提示词或 Skill，启动独立沙箱实验。
        </p>
      </div>

      {quota && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              并发数: <strong className="text-slate-900">{quota.active}</strong> / {quota.active_limit} ·
              24小时剩余额度: <strong className="text-slate-900">{quota.daily_remaining}</strong> / {quota.daily_limit}
            </span>
          </div>
          {quota.daily_remaining <= 0 && (
            <span className="text-rose-600 font-medium">今日额度已满，请等待恢复</span>
          )}
        </div>
      )}

      <form onSubmit={handleStartRun} className="flex flex-col gap-6">
        {/* Step 1 */}
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
            <span className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
              1
            </span>
            <h2 className="text-sm font-bold text-slate-900">选择挑战题目与版本</h2>
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
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex flex-col gap-1.5">
              <span className="font-semibold text-slate-700">任务提示词预览:</span>
              <p className="font-mono text-slate-600 line-clamp-3 leading-relaxed">
                {selectedChallengeDetail.versions.find((v) => v.id === selectedVersionId)?.prompt ||
                  selectedChallengeDetail.description}
              </p>
            </div>
          )}
        </Card>

        {/* Step 2 */}
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
                2
              </span>
              <h2 className="text-sm font-bold text-slate-900">连接配置与模型选择</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/connections")}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>管理/添加连接</span>
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 flex flex-col items-center gap-2 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <p className="text-xs text-amber-800">
                尚未配置任何 API 连接。TiHu 不存储你的明文 Key，由受信 Worker 仅在内存中临时代理。
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => navigate("/connections")}
              >
                前往添加连接
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
                  label: `${c.label} (${c.base_url})`,
                }))}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-700">
                  选择大模型
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
                    <div className="shrink-0 p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center">
                      <VendorIcon name={selectedModel} size={18} />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-2">
                    该连接未检测到可用模型，请在 API 连接页刷新模型列表。
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Step 3 */}
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
            <span className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
              3
            </span>
            <h2 className="text-sm font-bold text-slate-900">
              增强插件与自定义 Prompt (可选)
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                注入自定义前置提示词 (Prompt Template)
              </label>
              <button
                type="button"
                onClick={() => navigate("/prompts")}
                className="text-xs text-slate-500 hover:text-slate-800"
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

          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                挂载 Skill 扩展包 (最多选 4 个)
              </label>
              <button
                type="button"
                onClick={() => navigate("/skills")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                上传新 Skill
              </button>
            </div>

            {skills.length === 0 ? (
              <p className="text-xs text-slate-400">暂无可挂载的 Skill 扩展。</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {skills.map((s) => {
                  const selected = selectedSkillIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleToggleSkill(s.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                        selected
                          ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                          : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Puzzle className={`w-3.5 h-3.5 ${selected ? "text-white" : "text-slate-400"}`} />
                        <span className="text-xs font-medium">{s.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono ${selected ? "text-slate-300" : "text-slate-400"}`}>
                        v{s.current_version}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Consent & Submit */}
        <Card className="p-6 bg-white border-slate-200 flex flex-col gap-4">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-slate-900 focus:ring-slate-900 border-slate-300"
            />
            <div className="flex flex-col text-xs leading-relaxed">
              <span className="font-semibold text-slate-800">
                我理解本次实验将在真实服务商上发起 API 请求并可能产生费用
              </span>
              <span className="text-slate-500">
                运行采用零重试策略，遇错不会自动重复计费。生成的交互产物归创作者所有。
              </span>
            </div>
          </label>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="lg"
              variant="primary"
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
