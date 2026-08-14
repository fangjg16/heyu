import { INDUSTRY_TAXONOMY, sectorsForTheme, UNCATEGORIZED_LABEL } from "@/workspace/industry-taxonomy";

type IndustryCategoryFieldsProps = {
  theme: string;
  sector: string;
  onThemeChange: (theme: string) => void;
  onSectorChange: (sector: string) => void;
  /** 旧自由文本分类，无法映射到新树时提示 */
  legacyLabel?: string | null;
  className?: string;
};

export function IndustryCategoryFields({
  theme,
  sector,
  onThemeChange,
  onSectorChange,
  legacyLabel,
  className,
}: IndustryCategoryFieldsProps) {
  const sectors = sectorsForTheme(theme);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">主题板块</span>
          <select
            value={theme}
            onChange={(e) => {
              onThemeChange(e.target.value);
              onSectorChange("");
            }}
            className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm"
            aria-label="主题板块"
          >
            <option value="">{UNCATEGORIZED_LABEL}</option>
            {INDUSTRY_TAXONOMY.map((item) => (
              <option key={item.theme} value={item.theme}>
                {item.theme}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">可投子赛道 / 业务环节</span>
          <select
            value={sector}
            onChange={(e) => onSectorChange(e.target.value)}
            disabled={!theme}
            className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="可投子赛道"
          >
            <option value="">{theme ? "请选择子赛道" : "先选主题板块"}</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {legacyLabel ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800/90">
          原分类「{legacyLabel}」不在新目录中，请重新选择后保存。
        </p>
      ) : null}
    </div>
  );
}
