import { cn } from "@/lib/utils";
import type { ChapterSkillMapDto } from "@/lib/admin-skills-api";

type AdminChapterSkillMapProps = {
  data: ChapterSkillMapDto;
  knownSkills: Set<string>;
  onOpenSkill: (name: string) => void;
};

function SkillChip({
  name,
  tone,
  known,
  onOpen,
}: {
  name: string;
  tone: "primary" | "borrow";
  known: boolean;
  onOpen: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(name)}
      title={tone === "primary" ? "主 skill" : "借用 skill"}
      className={cn(
        "max-w-full truncate rounded-md px-1.5 py-0.5 text-left font-mono text-[10px] leading-tight",
        tone === "primary"
          ? "bg-[hsl(var(--wine-deep)/0.1)] font-medium text-[hsl(var(--wine-deep))]"
          : "bg-muted/80 text-muted-foreground",
        known ? "hover:underline" : "opacity-70",
      )}
    >
      {name}
    </button>
  );
}

export function AdminChapterSkillMap({
  data,
  knownSkills,
  onOpenSkill,
}: AdminChapterSkillMapProps) {
  if (!data.sections.length || !data.kinds.length) return null;

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border/70 bg-muted/40">
            <th className="sticky left-0 z-[1] bg-muted/40 px-3 py-2 text-[11px] font-semibold text-foreground">
              章节
            </th>
            {data.kinds.map((kind) => (
              <th
                key={kind.id}
                className="px-3 py-2 text-[11px] font-semibold text-foreground"
              >
                {kind.label}
                <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">
                  {kind.id}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.sections.map((section) => (
            <tr
              key={section.id}
              className="border-b border-border/50 last:border-b-0"
            >
              <th className="sticky left-0 z-[1] bg-white px-3 py-2.5 align-top text-[12px] font-medium text-foreground">
                {section.label}
                <div className="mt-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                  {section.id}
                </div>
              </th>
              {data.kinds.map((kind) => {
                const spec = data.cells[kind.id]?.[section.id];
                const primary = spec?.primary ?? [];
                const borrow = spec?.borrow ?? [];
                return (
                  <td key={kind.id} className="px-3 py-2.5 align-top">
                    <div className="flex flex-col items-start gap-1">
                      {primary.map((name) => (
                        <SkillChip
                          key={`p-${name}`}
                          name={name}
                          tone="primary"
                          known={knownSkills.has(name)}
                          onOpen={onOpenSkill}
                        />
                      ))}
                      {borrow.map((name) => (
                        <SkillChip
                          key={`b-${name}`}
                          name={name}
                          tone="borrow"
                          known={knownSkills.has(name)}
                          onOpen={onOpenSkill}
                        />
                      ))}
                      {primary.length === 0 && borrow.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">
                          —
                        </span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
        深色为主 skill，浅色为借用。点名称打开对应 Skill。
      </p>
    </div>
  );
}
