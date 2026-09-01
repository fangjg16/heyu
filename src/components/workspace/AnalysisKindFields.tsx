import { useId } from "react";
import { RequiredMark } from "@/components/workspace/IndustryCategoryFields";
import { cn } from "@/lib/utils";
import {
  ANALYSIS_KIND_OPTIONS,
  type AnalysisKind,
} from "@/lib/analysis-kind";

type AnalysisKindFieldsProps = {
  value: AnalysisKind | "";
  onChange: (kind: AnalysisKind) => void;
  required?: boolean;
  /** 编辑时传入原形态，改选后提示目录会切换 */
  originalKind?: AnalysisKind | null;
  className?: string;
};

export function AnalysisKindFields({
  value,
  onChange,
  required = true,
  originalKind = null,
  className,
}: AnalysisKindFieldsProps) {
  const switched =
    Boolean(originalKind) && value !== "" && value !== originalKind;
  const groupName = useId();

  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))]">
        项目形态
        {required ? <RequiredMark /> : null}
      </legend>
      <div className="grid gap-2">
        {ANALYSIS_KIND_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition",
                selected
                  ? "border-[hsl(var(--wine-deep)/0.45)] bg-[hsl(var(--wine-muted)/0.4)]"
                  : "border-[hsl(var(--sand)/0.9)] bg-white hover:border-[hsl(var(--wine)/0.28)]",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--wine))]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[hsl(var(--warm-charcoal))]">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[hsl(var(--warm-charcoal-muted))]">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {switched ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800/90">
          改形态后目录会跟着变。已有内容不会自动重写，需要再点「更新全部章节」。
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--warm-charcoal-muted))]">
          创建后可在编辑项目里改。
        </p>
      )}
    </fieldset>
  );
}
