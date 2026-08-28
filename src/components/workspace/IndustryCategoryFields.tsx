import { useId } from "react";
import { Link } from "react-router-dom";
import {
  INDUSTRY_TAXONOMY,
  sectorsForTheme,
  UNCATEGORIZED_LABEL,
  type IndustryTheme,
} from "@/workspace/industry-taxonomy";

export function RequiredMark() {
  return (
    <span className="ml-0.5 font-medium text-red-600" aria-hidden>
      *
    </span>
  );
}

type IndustryCategoryFieldsProps = {
  theme: string;
  sector: string;
  onThemeChange: (theme: string) => void;
  onSectorChange: (sector: string) => void;
  taxonomy?: IndustryTheme[];
  /** 旧自由文本分类，无法映射到树时提示 */
  legacyLabel?: string | null;
  className?: string;
  themeRequired?: boolean;
  editorHref?: string | null;
};

export function IndustryCategoryFields({
  theme,
  sector,
  onThemeChange,
  onSectorChange,
  taxonomy = INDUSTRY_TAXONOMY,
  legacyLabel,
  className,
  themeRequired = false,
  editorHref = null,
}: IndustryCategoryFieldsProps) {
  const uid = useId();
  const themeListId = `${uid}-theme`;
  const sectorListId = `${uid}-sector`;
  const sectors = sectorsForTheme(theme, taxonomy);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">
            一级分类
            {themeRequired ? <RequiredMark /> : null}
          </span>
          <input
            list={themeListId}
            value={theme}
            onChange={(e) => {
              const next = e.target.value;
              onThemeChange(next);
              const nextSectors = sectorsForTheme(next, taxonomy);
              if (sector && nextSectors.length > 0 && !nextSectors.includes(sector)) {
                onSectorChange("");
              }
            }}
            className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm"
            aria-label="一级分类"
            required={themeRequired}
            placeholder={UNCATEGORIZED_LABEL}
            autoComplete="off"
          />
          <datalist id={themeListId}>
            {taxonomy.map((item) => (
              <option key={item.theme} value={item.theme} />
            ))}
          </datalist>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">二级分类</span>
          <input
            list={sectorListId}
            value={sector}
            onChange={(e) => onSectorChange(e.target.value)}
            disabled={!theme}
            className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="二级分类"
            placeholder={theme ? "二级分类（选填，可手动输入）" : "先填一级分类"}
            autoComplete="off"
          />
          <datalist id={sectorListId}>
            {sectors.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        可从列表选择或手动填写
        {editorHref ? (
          <>
            。管理员可
            <Link
              to={editorHref}
              className="mx-0.5 font-medium text-[hsl(var(--wine))] underline-offset-2 hover:underline"
            >
              编辑分类列表
            </Link>
          </>
        ) : (
          "。"
        )}
      </p>
      {legacyLabel ? (
        <p className="mt-1 text-[11px] leading-relaxed text-amber-800/90">
          原分类「{legacyLabel}」已按自定义内容载入，可改选列表或继续手动编辑后保存。
        </p>
      ) : null}
    </div>
  );
}
