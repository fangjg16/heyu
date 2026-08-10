import { readFileSync, writeFileSync } from "node:fs";
import {
  detectSuspiciousIndustryTimeline,
  validateKnowledgeNetworkHtml,
} from "../src/knowledge-network-html-validation.ts";

const raw = readFileSync("scripts/_proj-timeline-check.html", "utf8");
const j = JSON.parse(raw) as {
  html: string;
  meta?: { version?: number; lastJobId?: string; updatedAt?: string };
};
const h = j.html;
writeFileSync("scripts/_proj-kb-v3.html", h);
const u = h.replace(/<!--[\s\S]*?-->/g, "");
const sec =
  u.match(/<section[^>]*id=["']timeline["'][\s\S]*?<\/section>/i)?.[0] ?? "";

console.log("meta", j.meta);
console.log("hasStub", /暂无已核实|callout missing/i.test(sec));
console.log("hasIndustry", /市场规模|技术跃升|行业洗牌/i.test(sec));
console.log("hasProject", /项目方|签约|尽调|审批|KYC/i.test(sec));
console.log("tl-items", (sec.match(/tl-item/gi) ?? []).length);
console.log("warning", detectSuspiciousIndustryTimeline(u));
const v = validateKnowledgeNetworkHtml(h, { strict: true, mode: "full" });
console.log("validate", { ok: v.ok, warning: v.warning ?? null });
console.log("\n--- timeline section (first 1200 chars) ---\n");
console.log(sec.slice(0, 1200));
