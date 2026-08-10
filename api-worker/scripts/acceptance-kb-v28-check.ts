import { readFileSync } from "fs";
import {
  validateKnowledgeNetworkHtml,
  validateSampleOutputChecks,
  CANONICAL_KB_SLOTS,
} from "../src/knowledge-network-html-validation.ts";
import { buildHermesKnowledgeNetworkRequiredReads } from "../src/hermes-knowledge-network.ts";
import { resolveMaterialsDigestIntensity } from "../src/hermes-materials-digest.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const html = readFileSync("scripts/_acceptance-kb.html", "utf8");
const sample = validateSampleOutputChecks(html);
const strict = validateKnowledgeNetworkHtml(html, { strict: true, mode: "full" });

console.log("=== Production KB (job 8d773537) ===");
console.log("strict full:", strict.ok, strict.error ?? strict.warning ?? "");
for (const s of CANONICAL_KB_SLOTS) {
  console.log(`  slot #${s}:`, sample.checks[`slot_${s}`]);
}
console.log("  revealAnchor:", sample.checks.hasRevealAnchor);
console.log("  source-index:", sample.checks.hasSourceIndex);
console.log("  risk-matrix:", /risk-matrix-table/.test(html));
console.log("  oq-group:", /oq-group/.test(html));
console.log(
  "  timeline 3-block:",
  /已发生关键事件/.test(html) &&
    /正在推进/.test(html) &&
    /未来关键节点/.test(html),
);
console.log(
  "  citation A-1 ↔ appendix:",
  /href=["']#source-A-1["']/.test(html) && /id=["']source-A-1["']/.test(html),
);
console.log(
  "  decision-framework chars:",
  (html.match(/id=["']decision-framework["'][\s\S]*?<\/section>/) ?? [""])[0]
    .length,
);

console.log("\n=== Mode regression (Worker injection) ===");
const reorder = buildHermesKnowledgeNetworkRequiredReads({ mode: "reorder" });
assert(!reorder.includes("kb-schema.md"), "reorder must not read kb-schema");
assert(!reorder.includes("kb-template.html"), "reorder must not read template");
assert(reorder.includes("禁止") && reorder.includes("项目资料"), "reorder forbids materials");
assert(
  resolveMaterialsDigestIntensity("knowledge_network", "reorder") === "none",
  "reorder digest none",
);
console.log("reorder required reads: PASS");

const incremental = buildHermesKnowledgeNetworkRequiredReads({ mode: "incremental" });
assert(incremental.includes("增量"), "incremental label");
assert(
  resolveMaterialsDigestIntensity("knowledge_network", "incremental") ===
    "session_priority",
  "incremental digest session_priority",
);
console.log("incremental required reads: PASS");

const reordered = readFileSync(
  "../hermes-railway/skills/knowledge-base-generation/examples/sample-output-reordered.html",
  "utf8",
);
const original = readFileSync(
  "../hermes-railway/skills/knowledge-base-generation/examples/sample-output.html",
  "utf8",
);
const rv = validateKnowledgeNetworkHtml(reordered, {
  mode: "reorder",
  previousHtml: original,
  strict: true,
});
assert(rv.ok, `reorder sample: ${rv.error}`);
console.log("reorder sample validation: PASS");

console.log("\nAll acceptance checks passed.");
