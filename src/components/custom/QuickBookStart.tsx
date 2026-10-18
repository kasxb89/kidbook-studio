"use client";
import { useState } from "react";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import type { CustomWorkbenchDraft } from "@/lib/custom-workbench";
import { createBookBrief, selectBookDomain } from "@/lib/book-domain";
import type { LiveCustomJob } from "@/hooks/useCustomBook";
import s from "./QuickBookStart.module.css";
import PageCountField from "./PageCountField";
import ScenarioSelect from "./ScenarioSelect";
import { setWorkbenchPageCount } from "@/lib/custom-workbench";
import { MIN_BOOK_PAGES,MAX_BOOK_PAGES,OUTLINE_BATCH_PAGES } from "@/lib/book-config";
export default function QuickBookStart({
  draft,
  onChange,
  onPrepare,
  onUpload,
  onGenerate,
  onReview,
  onResume,
  onRetry,
  job,
  disabled,
  preparing,
}: {
  draft: CustomWorkbenchDraft;
  onChange: (draft: CustomWorkbenchDraft) => void;
  onPrepare: () => Promise<void>;
  onUpload: (file: File) => void;
  onGenerate: () => void;
  onReview: () => void;
  onResume: () => void;
  onRetry: () => void;
  job: LiveCustomJob | null;
  disabled: boolean;
  preparing: boolean;
}) {
  const [details, setDetails] = useState(false);
  const brief = draft.brief || createBookBrief();
  const patch = (value: Partial<CustomWorkbenchDraft>) =>
    onChange({
      ...draft,
      ...value,
      studio: { ...draft.studio, aiPrepared: false },
    });
  const hasJob = !!job && !["complete", "failed"].includes(job.status);
  return (
    <section className={s.quick} aria-label="AI 辅助创作">
      <header>
        <span>创作简报</span>
        <h2>把孩子的故事写下来</h2>
        <p>说清经历和想法，AI 帮你起草书名、人物设定和故事分镜。</p>
      </header>
      <details open={!hasJob && !draft.studio?.aiPrepared} className={s.source}>
        <summary>
          原始经历与基本信息
          {draft.characters[0]?.name ? ` · ${draft.characters[0].name}` : ""}
        </summary>
        <fieldset disabled={disabled || preparing || hasJob}>
          <div className={s.row}>
          <label>
            想做哪一类绘本？
            <select
              aria-label="快速创作领域"
              value={brief.domain}
              onChange={(e) => {
                const domain = e.target.value as typeof brief.domain;
                patch({
                  brief: selectBookDomain(brief,domain),
                });
              }}
            >
              <option value="habits">养成好习惯</option>
              <option value="memories">孩子的真实经历</option>
              <option value="learning">识图、识物与识字</option>
            </select>
          </label>
          <label>
            分场景 · 20 个常用场景
            <ScenarioSelect brief={brief} label="快速分场景" onChange={next=>patch({brief:next})}/>
          </label>
          </div>
          <div className={s.row}>
            <label>
              孩子怎么称呼？
              <input
                aria-label="孩子称呼"
                value={draft.characters[0]?.name || ""}
                maxLength={40}
                placeholder="例如：若汐"
                onChange={(e) =>
                  patch({
                    characters: draft.characters.map((c, i) =>
                      i === 0 ? { ...c, name: e.target.value } : c,
                    ),
                  })
                }
              />
            </label>
            <label>
              适读年龄
              <select
                aria-label="快速适读年龄"
                value={draft.age}
                onChange={(e) => patch({ age: e.target.value })}
              >
                <option>2–3 岁</option>
                <option>4–5 岁</option>
                <option>6–8 岁</option>
              </select>
            </label>
          </div>
          <label>
            {brief.domain === "learning"
              ? "想让孩子认识什么？"
              : "发生了什么？"}
            <textarea
              aria-label="一段故事经历"
              value={draft.story}
              maxLength={brief.domain === "memories" ? 10000 : 15000}
              placeholder={brief.domain==="learning"?"说说希望孩子认识哪些画面、物品或汉字，也可以补充想用的生活场景。":brief.domain==="memories"?"按实际经过说几句：去了哪里、和谁一起、发生了什么。没有提供的原话和细节会保留给你核对。":"例如：若汐在沙池搭城堡。干沙总是散开，她有些难过。休息后，她换了湿沙，终于搭成了一座小沙堡。"}
              onChange={(e) =>
                patch({
                  story: e.target.value,
                  brief: { ...brief, factsConfirmed: false },
                })
              }
            />
          </label>
          <details className={s.bookOptions}>
            <summary>照片与成书设置 <small>{draft.pageCount} 页正文 · {draft.characters[0]?.asset?"已添加照片":"照片可选"}</small></summary>
          <label>
            计划正文页数（{MIN_BOOK_PAGES}–{MAX_BOOK_PAGES}，封面另外计算）
            <PageCountField label="快速正文页数" value={draft.pageCount} onChange={count=>onChange(setWorkbenchPageCount(draft,count))}/>
          </label>
          <label className={s.photoUpload}>
            参考照片（可选）
            <span className={s.uploadAction}><ImageIcon size={17} aria-hidden="true"/>选择人物参考照片</span>
            <input
              aria-label="孩子参考照片"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {draft.characters[0]?.asset && (
            <img
              className={s.reference}
              src={draft.characters[0].asset.src}
              alt="孩子参考照片"
            />
          )}
          <small>不上传照片也能先用插画角色试做。</small>
          </details>
          <button
            className={s.primary}
            disabled={!draft.characters[0]?.name.trim() || !draft.story.trim()}
            onClick={() => void onPrepare()}
          >
            {preparing
              ? "AI 正在整理，请稍候…"
              : draft.studio?.aiPrepared
                ? "重新整理创作设定"
                : "让 AI 帮我整理设定"}
          </button>
        </fieldset>
      </details>
      {draft.studio?.aiPrepared && !hasJob && (
        <details className={s.result} aria-label="AI 起草结果" open={job?.status!=="complete"}>
          <summary>创作设定 · {draft.title}</summary>
          <span>AI 创作建议</span>
          <h3>{draft.title}</h3>
          {brief.scenario&&<p><strong>分场景</strong>{brief.scenario}</p>}
          <p>
            <strong>本书方向</strong>
            {draft.theme}
          </p>
          <p>
            <strong>
              {brief.domain === "habits"
                ? "练习目标"
                : brief.domain === "learning"
                  ? "认知目标"
                  : "故事依据"}
            </strong>
            {brief.domain === "habits"
              ? brief.habitGoal
              : brief.domain === "learning"
                ? brief.targets
                : brief.facts}
          </p>
          <p>
            <strong>出场人物</strong>
            {draft.characters.map((c) => c.name).join("、")}
          </p>
          <button onClick={() => setDetails(!details)} aria-expanded={details}>
            {details ? "收起人物设定" : "查看 AI 建议的人物与服装"}
          </button>
          {details &&
            draft.characters.map((c) => (
              <p key={c.id}>
                <strong>{c.name}</strong>
                {c.appearance} {c.outfit}
              </p>
            ))}
          <small>
            没有参考照片时，人物外观是插画建议。上传照片后可作为角色参考。
          </small>
          {brief.domain === "memories" && (
            <label className={s.confirm}>
              <input
                type="checkbox"
                checked={brief.factsConfirmed}
                disabled={disabled || hasJob}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    brief: { ...brief, factsConfirmed: e.target.checked },
                  })
                }
              />
              我已核对真实经过；未提供的原话和关系不会被当作事实。
            </label>
          )}
          <button
            className={s.primary}
            disabled={
              disabled ||
              preparing ||
              hasJob ||
              (brief.domain === "memories" && !brief.factsConfirmed)
            }
            onClick={onGenerate}
          >
            生成 {draft.pageCount} 页故事分镜 →
          </button>
        </details>
      )}
      {job && (
        <section className={s.progress} aria-live="polite">
          <span>制作进度</span>
          <h3>
            {
              {
                outline: "正在写故事分镜",
                review: "分镜已起草，等你确认",
                images: "正在绘制插图",
                retryable: "这一步需要恢复",
                complete: "这本绘本已经生成",
                failed: "任务已结束",
              }[job.status]
            }
          </h3>
          <p>
            {job.status === "images" || job.status === "complete"
              ? `已完成 ${job.cursor} / ${job.totalUnits} 张角色与书页插图`
              : job.status==="outline" ? (draft.pageCount>OUTLINE_BATCH_PAGES&&!job.outlinePlan ? `正在规划 ${draft.pageCount} 页的全书节奏…` : `分镜已完成 ${job.outlineCursor||0} / ${draft.pageCount} 页，每批自动保存。`) : "先核对故事内容，再开始生成插图。"}
          </p>
          {(job.status==="images"||job.status==="complete")&&<progress aria-label="插图制作进度" value={job.cursor} max={Math.max(1,job.totalUnits)}/>}
          {job.error && <p role="alert">{job.error}</p>}
          {job.status === "review" && (
            <button className={s.primary} onClick={onReview}>
              检查并确认故事分镜
            </button>
          )}
          {job.status === "retryable" && (
            <button disabled={disabled} onClick={onRetry}>
              恢复当前步骤
            </button>
          )}
          {["outline", "images"].includes(job.status) && (
            <button disabled={disabled} onClick={onResume}>
              继续本机生成任务
            </button>
          )}
        </section>
      )}
    </section>
  );
}
