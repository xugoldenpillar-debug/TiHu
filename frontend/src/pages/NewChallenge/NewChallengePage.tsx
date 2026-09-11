import React, { useState } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { Challenge } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { ArrowLeft, Sparkles, Image as ImageIcon } from "lucide-react";

const ART_PRESETS = [
  { label: "戴头盔的鹈鹕 (Pelican)", value: "/art/challenge-pelican.svg" },
  { label: "秦始皇骑北极熊 (Polar Bear)", value: "/art/challenge-polar-bear.svg" },
  { label: "掌心里的小世界 (Ecosystem)", value: "/art/challenge-ecosystem.svg" },
  { label: "出人意料的时钟 (Clock)", value: "/art/challenge-clock.svg" },
];

export function NewChallengePage() {
  const { navigate, showToast, config } = useApp();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("代码动效");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [art, setArt] = useState(ART_PRESETS[0].value);
  const [submitting, setSubmitting] = useState(false);

  const categories = config?.categories?.length
    ? config.categories
    : ["代码动效", "前端工程", "数据可视化", "游戏与交互", "AI与算法"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api<Challenge>("/challenges", {
        method: "POST",
        body: JSON.stringify({
          title,
          category,
          description,
          prompt,
          rubric,
          art,
        }),
      });
      showToast("挑战题目创建成功！", "success");
      navigate(`/challenge/${res.id}`);
    } catch (err) {
      showToast(errorText(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-16 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/explore")}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>取消并返回</span>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
          创建全新挑战题目
        </h1>
        <p className="text-slate-400 text-sm">
          设定清晰、有辨识度且具有深度评测价值的前端/动画任务，供社区大模型一较高下。
        </p>
      </div>

      <Card className="p-6 sm:p-8 bg-slate-900/80">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="题目名称 (Title)"
              required
              placeholder="如：绘制生动的 SVG 粒子时钟"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select
              label="所属赛道分类"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          </div>

          <Textarea
            label="简要介绍 (Description)"
            rows={2}
            placeholder="简要概括这道题考察的重点，如：考察模型对矢量图形渲染和运动几何节奏的理解..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Art Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 tracking-wide flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>选择主题插画</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ART_PRESETS.map((p) => {
                const selected = art === p.value;
                return (
                  <div
                    key={p.value}
                    onClick={() => setArt(p.value)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                      selected
                        ? "bg-sky-500/15 border-sky-500/60 shadow-lg shadow-sky-500/15"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={p.value} alt={p.label} className="w-16 h-16 object-contain" />
                    <span className="text-[11px] font-medium text-slate-300 text-center line-clamp-1">
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Textarea
            label="初始版本提示词 (Initial Prompt · 智能体将直接接收此任务)"
            required
            rows={5}
            placeholder="请使用单个自包含的 index.html 编写..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <Textarea
            label="评分参考准则 (Rubric · 供社区评审及能力打分参考)"
            rows={4}
            placeholder="1. 视觉结构自然清晰&#10;2. 动画流畅无卡顿&#10;3. 布局自适应..."
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/explore")}
            >
              取消
            </Button>
            <Button
              type="submit"
              loading={submitting}
              variant="glow"
              icon={<Sparkles className="w-4 h-4" />}
            >
              立即发布题目
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
