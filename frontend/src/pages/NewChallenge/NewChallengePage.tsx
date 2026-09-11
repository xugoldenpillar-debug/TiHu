import React, { useState, useRef } from "react";
import { useApp } from "../../context/AppContext";
import { api, errorText } from "../../api/client";
import type { Challenge } from "../../types";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import {
  ArrowLeft,
  Sparkles,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  Trash2,
  Layers,
} from "lucide-react";

const ART_PRESETS = [
  { label: "戴头盔的鹈鹕 (Pelican)", value: "/art/challenge-pelican.svg" },
  { label: "秦始皇骑北极熊 (Qin Shi Huang)", value: "/challenge-qinshihuang.png" },
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
  const [art, setArt] = useState<string>(ART_PRESETS[0].value);
  const [isCustomUploaded, setIsCustomUploaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categories = config?.categories?.length
    ? config.categories
    : ["代码动效", "前端工程", "数据可视化", "游戏与交互", "AI与算法"];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("插画图片文件大小不能超过 2MB", "warning");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setArt(result);
        setIsCustomUploaded(true);
        showToast("自定义插画已成功载入！", "success");
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (val: string) => {
    setArt(val);
    setIsCustomUploaded(false);
  };

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
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/explore")}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>取消并返回探索</span>
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          设计全新的基准挑战
        </h1>
        <p className="text-slate-500 text-xs">
          设定清晰、有辨识度且具有深度代码评测价值的任务，并上传专属封面插画。
        </p>
      </div>

      <Card className="p-6 sm:p-8 bg-white/90 border-slate-200/90 shadow-sm backdrop-blur-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Title and Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="题目名称"
              required
              placeholder="如：绘制生动的 SVG 粒子时钟"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <Select
              label="分类类别"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={categories.map((c) => ({ label: c, value: c }))}
            />
          </div>

          {/* Theme Art Upload & Selector Section */}
          <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <span>主题插画封面 (Challenge Cover Art)</span>
              </label>
              {isCustomUploaded && (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已选用自定义上传
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              {/* Art Preview */}
              <div className="relative aspect-16/10 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-3 shadow-inner">
                {art ? (
                  <img
                    src={art}
                    alt="Cover preview"
                    className="w-full h-full object-contain filter drop-shadow-xs"
                  />
                ) : (
                  <div className="flex flex-col items-center text-slate-400 gap-1 text-xs">
                    <Layers className="w-6 h-6" />
                    <span>暂无插画</span>
                  </div>
                )}

                {isCustomUploaded && (
                  <button
                    type="button"
                    onClick={() => {
                      setArt(ART_PRESETS[0].value);
                      setIsCustomUploaded(false);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-900/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                    title="移除自定义插画并恢复默认"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Upload Action Box */}
              <div className="flex flex-col gap-2 md:col-span-2">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/30 transition-all cursor-pointer text-center"
                >
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition-colors" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
                      点击上传本地插画文件
                    </span>
                    <span className="text-[10px] text-slate-400">
                      支持 SVG、PNG、JPG、WebP (建议 800x500 以上，不超过 2MB)
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>

                {/* Preset Thumbnails */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-400 shrink-0 font-medium">或选用预设:</span>
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {ART_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => handlePresetSelect(p.value)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          !isCustomUploaded && art === p.value
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {p.label.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Textarea
            label="题目背景描述"
            required
            rows={3}
            placeholder="描述此题目的评测目标、核心交互或者想要检验的视觉特征..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Textarea
            label="初始 Prompt (系统指令)"
            required
            rows={6}
            placeholder="输入注入给智能体编码环境的初始提示词..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <Textarea
            label="评审标准 (Rubric 评测指引)"
            required
            rows={4}
            placeholder="如：1. 必须完全使用标准 SVG 格式；2. 动画必须流畅..."
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/explore")}
            >
              取消
            </Button>
            <Button
              type="submit"
              loading={submitting}
              variant="primary"
              size="sm"
              icon={<Sparkles className="w-3.5 h-3.5 text-amber-300" />}
            >
              立即发布新题目
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
