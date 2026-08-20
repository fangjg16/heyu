import type { AnalysisKind } from "./analysis-kind";

/**
 * 章节版式里用注释圈出按形态才出现的块：
 *   <!-- kn:begin early -->
 *   ...
 *   <!-- kn:end -->
 * 也可写 <!-- kn:begin mature,acquire -->
 * 生成前由服务端剥掉不匹配块，模型只看到适用骨架。
 */
const KIND_BLOCK_RE =
  /<!--\s*kn:begin\s+([a-z,\s]+)\s*-->\s*([\s\S]*?)\s*<!--\s*kn:end\s*-->/giu;

export function filterTemplateByKind(
  markdown: string,
  kind: AnalysisKind,
): string {
  const src = String(markdown ?? "");
  return src
    .replace(KIND_BLOCK_RE, (_full, kindsRaw: string, inner: string) => {
      const kinds = String(kindsRaw)
        .split(/[,|\s]+/u)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (kinds.includes(kind) || kinds.includes("all")) {
        return inner.trim();
      }
      return "";
    })
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
