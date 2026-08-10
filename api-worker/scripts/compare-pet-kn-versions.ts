import fs from "node:fs";

const paths = [
  {
    label: "v1",
    file: "C:/Users/jensenfang/.cursor/projects/c-Users-jensenfang-Downloads/agent-tools/pet-kn-v1.json",
  },
  {
    label: "v2",
    file: "C:/Users/jensenfang/.cursor/projects/c-Users-jensenfang-Downloads/agent-tools/pet-kn-v2.json",
  },
];

const slots = [
  "regulatory-compliance",
  "valuation-returns",
  "diligence-gaps",
  "risks-mitigation",
] as const;

function extractSection(html: string, id: string): string {
  const byId = new RegExp(
    `id=["']${id}["'][\\s\\S]*?(?=<section\\s+class=["']block kb-panel["']\\s+id=|</main>)`,
    "i",
  );
  const hit = html.match(byId)?.[0];
  if (hit) return hit;

  const titleMap: Record<string, RegExp> = {
    "regulatory-compliance": /监管合规[\s\S]*?(?=<section|<!-- ═|$)/i,
    "valuation-returns": /投资回报[\s\S]*?(?=<section|<!-- ═|$)/i,
    "diligence-gaps": /尽调缺口|待确认问题[\s\S]*?(?=<section|<!-- ═|$)/i,
    "risks-mitigation": /风险缓释|关键风险[\s\S]*?(?=<section|<!-- ═|$)/i,
  };
  return html.match(titleMap[id] ?? /$^/)?.[0] ?? "";
}

for (const { label, file } of paths) {
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { html?: string; version?: number };
  const html = data.html ?? "";
  console.log(`\n=== ${label} | html ${html.length} chars ===`);
  for (const id of slots) {
    const block = extractSection(html, id);
    const rows = (block.match(/<tr/gi) ?? []).length;
    const oq = (block.match(/class=["']oq-item/gi) ?? []).length;
    const risks = (block.match(/risk-level/gi) ?? []).length;
    const stub = /Stub|信息严重不足|无法建模|缺失可比/i.test(block);
    console.log(
      `${id}: ${block.length} chars | tr=${rows} | oq=${oq} | risk-level=${risks} | stub=${stub}`,
    );
  }
  const schema = html.match(/schema-version:\s*([\d.]+)/i)?.[1] ?? "?";
  const maturity = html.match(/综合成熟度[\s\S]{0,80}?(\d+)%/i)?.[1];
  const factorA = html.match(/Factor A[\s\S]{0,80}?(\d+)%/i)?.[1];
  const sources = extractSection(html, "source-index");
  const srcRows = Math.max(0, (sources.match(/<tr/gi) ?? []).length - 1);
  console.log(`schema=${schema} | maturity=${maturity}% | factorA=${factorA}% | sources=${srcRows}`);
}
