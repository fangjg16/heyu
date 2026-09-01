/**
 * 将 docs/knowledge-network 下章节 Markdown 模板 upsert 进 MySQL，
 * 并写入章节 format_hint / 全局 generate_system（空字段才填，--force 强制覆盖）。
 * 用法：cd api-worker && npm run seed:kn-chapter-templates [-- --force]
 * 依赖：migration 0017 + 0020
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..");
const knRoot = (
  process.env.KN_DOCS_ROOT?.trim() ||
  path.join(repoRoot, "docs", "knowledge-network")
);
const chaptersRoot = path.join(knRoot, "chapters");
const force = process.argv.includes("--force");

const FILES = [
  { rel: "project-overview.md", sort: 5, base: knRoot },
  { rel: "mature/investment-conclusion.md", sort: 10, base: chaptersRoot },
  { rel: "mature/project-summary.md", sort: 20, base: chaptersRoot },
  { rel: "mature/industry-competition.md", sort: 30, base: chaptersRoot },
  { rel: "mature/business-technology.md", sort: 40, base: chaptersRoot },
  { rel: "mature/company-team.md", sort: 50, base: chaptersRoot },
  { rel: "mature/financial-diligence.md", sort: 60, base: chaptersRoot },
  { rel: "mature/investment-structure-returns.md", sort: 70, base: chaptersRoot },
  { rel: "mature/investment-risks.md", sort: 80, base: chaptersRoot },
  { rel: "mature/diligence-gaps.md", sort: 90, base: chaptersRoot },
  { rel: "acquire/exec-verdict.md", sort: 100, base: chaptersRoot },
  { rel: "acquire/decision-object.md", sort: 110, base: chaptersRoot },
  { rel: "acquire/business-worth-buying.md", sort: 120, base: chaptersRoot },
  { rel: "acquire/price-financing-downside.md", sort: 130, base: chaptersRoot },
  { rel: "acquire/buyer-fit-takeover.md", sort: 140, base: chaptersRoot },
  { rel: "acquire/acquisition-risk-register.md", sort: 150, base: chaptersRoot },
  { rel: "acquire/open-items-exceptions.md", sort: 160, base: chaptersRoot },
  { rel: "acquire/counterarguments-invalidation.md", sort: 170, base: chaptersRoot },
  { rel: "acquire/recommendation-conditions.md", sort: 180, base: chaptersRoot },
  { rel: "early/founder-interview.md", sort: 200, base: chaptersRoot },
  { rel: "early/market-discovery.md", sort: 210, base: chaptersRoot },
  { rel: "early/strategy.md", sort: 220, base: chaptersRoot },
  { rel: "early/brand.md", sort: 230, base: chaptersRoot },
  { rel: "early/product.md", sort: 240, base: chaptersRoot },
  { rel: "early/financials.md", sort: 250, base: chaptersRoot },
  { rel: "early/validation.md", sort: 260, base: chaptersRoot },
  { rel: "overview/snapshot.md", sort: 400, base: chaptersRoot },
  { rel: "overview/objectives.md", sort: 410, base: chaptersRoot },
  { rel: "research/industry.md", sort: 420, base: chaptersRoot },
  { rel: "research/legal.md", sort: 430, base: chaptersRoot },
  { rel: "research/benchmarks.md", sort: 440, base: chaptersRoot },
  { rel: "structure/business.md", sort: 450, base: chaptersRoot },
  { rel: "structure/returns.md", sort: 460, base: chaptersRoot },
  { rel: "structure/capabilities.md", sort: 470, base: chaptersRoot },
  { rel: "structure/ownership.md", sort: 480, base: chaptersRoot },
  { rel: "structure/diligence.md", sort: 490, base: chaptersRoot },
  { rel: "risk/risks.md", sort: 500, base: chaptersRoot },
  { rel: "risk/questions.md", sort: 510, base: chaptersRoot },
  { rel: "risk/framework.md", sort: 520, base: chaptersRoot },
];

/** 与 project-knowledge-chapters-routes.ts GENERATE_SYSTEM 对齐 */
const DEFAULT_GENERATE_SYSTEM = `你是投研知识网络章节撰写助手。根据「章节 Markdown 模板」的结构，并**综合分析本项目资料包全部上传附件**中的事实，输出带标记的 HTML（不要完整 html/body/head，不要 markdown 围栏）。

硬性规则：
1. 模板有什么块、表头与内联 style，输出就保留什么；允许按资料增删数据行，禁止改表头、禁止增加模板没有的大块（尤其禁止「填写指引」、长篇前言、页外说明）。
2. 输出格式严格为标记分段（顺序固定）：
===CHAPTER===
（本章 HTML）
===GRAPH===
（仅「项目概览」：关系图 JSON；其他章节写 NONE）
===SOURCES_ADD===
（本章新出现的引用来源；无新增写 NONE）
===GLOSSARY_ADD===
（本章新出现的非常用名词；无新增写 NONE）
3. 引用来源与名词解释均为**增量**：禁止重写整张已有表；已有 ID / 已有名词不得再输出；只补新行。
4. 名词解释只收非常用术语（如多字母缩写 GRS、rPTA、AHPRA、BPC-157、FTO、Schedule 4）；常识词（公司、投资、市场、股权、利润等）禁止加入。
5. 凡表格「证据/来源」列：单元格内**只输出**引用标记如 [A-1]，禁止「项目协作方整理」「项目方整理」「BP称」等说明文字；多个引用用空格分隔。
6. 表格表头须可单行完整显示（勿把长表头拆成多行文字）。
7. 若模板已含 class 或内联 style：必须保留，只替换「待补」内容。禁止拆掉 kn-callout、kn-gate、kn-stats 等 class。
8. 事实必须来自附件摘录；缺依据写「待补」，禁止编造。
9. 标记外禁止任何说明文字。章节内图表用 HTML <table>（含热力图格子），禁止 SVG。关系图禁止输出 SVG/HTML，只输出 JSON。
10. 若用户消息含「分析方法」：只用来填模板中的「待补」；禁止改表头、禁止用分析方法里的示例表替换骨架、禁止改成散文。允许按资料增删数据行。版式以章节 Markdown 模板为准。`;

/** 与 project-knowledge-chapters-routes.ts SECTION_FORMAT_HINT 对齐 */
const DEFAULT_FORMAT_HINTS = {
  "project-summary":
    "===CHAPTER=== 判断条 + 类型/辖区/阶段数字条 + 范围表 + 交易要点表。保留 class。证据列只写 [A-1]。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "industry-competition":
    "===CHAPTER=== 判断条 + 总市场/可服务市场/可获得份额数字条（不要写 TAM/SAM/SOM 当主标题）+ 可比表 + 红黄旗。不要对战卡。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "business-technology":
    "===CHAPTER=== 判断条 + 客户路径 + BMC 宫格 + 单位经济表。禁止 IRR/三情景。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "company-team":
    "===CHAPTER=== 判断条 + 控制链卡片 + 主体表 + 关键个人表 + 红黄旗。禁止 SVG。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "financial-diligence":
    "===CHAPTER=== 判断条 + 收入/毛利率/现金数字条 + 账实质量表。禁止三情景、禁止 IRR。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "investment-structure-returns":
    "===CHAPTER=== 判断条 + 估值大数字 + Down/Base/Up 三情景 + 结构敏感性表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "investment-risks":
    "===CHAPTER=== 判断条 + 4×4 热力图（保留 kn-heat-* 底色）+ 带徽章的风险登记表。禁止 SVG。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "diligence-gaps":
    "===CHAPTER=== 判断条 + P1/P2/P3 kn-fold 折叠。允许增删 li。禁止改成三列表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "investment-conclusion":
    "===CHAPTER=== 建议判断条 + 推进/暂缓左右对照 + 路线图。不要闸门灯。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "exec-verdict":
    "===CHAPTER=== 闸门灯三态只亮一态（买/有条件/不买）+ 理由 + 建议判断条。不要概况数字条。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "decision-object":
    "===CHAPTER=== 判断条 + 标的/版本/范围数字条 + 边界表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "business-worth-buying":
    "===CHAPTER=== 判断条 + 客户路径 + 值不值得买表。不要行业总市场数字条。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "price-financing-downside":
    "===CHAPTER=== 判断条 + 拟买价大数字 + 下行存活/基准/上行三情景 + 融资表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "buyer-fit-takeover":
    "===CHAPTER=== 判断条 + 接手节奏路径 + 适配表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "acquisition-risk-register":
    "===CHAPTER=== 判断条 + 热力图 + 徽章登记表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "open-items-exceptions":
    "===CHAPTER=== 判断条 + P1/P2/P3 折叠。禁止三列表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "counterarguments-invalidation":
    "===CHAPTER=== 判断条 + 声称/反例左右对照 + 失效条件（信号→处置）。不要总市场数字条。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "recommendation-conditions":
    "===CHAPTER=== 建议判断条 + 可以买的条件/不应买 左右对照 + 路线图。不要再做一盏闸门灯。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "founder-interview":
    "===CHAPTER=== 有访谈：访谈摘要 + 引用条 + 已覆盖/待澄清议题。无访谈：只留「尚未开展」，删掉引用和表。禁止尽调三列表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "market-discovery":
    "===CHAPTER=== 有材料：判断条 + 对战卡 + 功能对比表。无材料：只留尚未开展。不要总市场投资版数字条。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  strategy:
    "===CHAPTER=== 有材料：判断条 + Lean 宫格。无材料：只留尚未开展。禁止尽调表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  brand:
    "===CHAPTER=== 有材料：判断条 + 调性板（语气/关键词/禁区）。无材料：只留尚未开展。禁止 Canvas。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  product:
    "===CHAPTER=== 有材料：判断条 + 路径 + 功能现状表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  financials:
    "===CHAPTER=== 有材料：判断条 + 跑道/消耗/收入数字条 + 假设表。禁止三情景和 IRR。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  validation:
    "===CHAPTER=== 有实验：判断条 + 通过/未通过/进行中计数 + 实验表。禁止 IRR。无实验：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  snapshot:
    "===CHAPTER=== 按模板：一句话范围 + 类型/辖区/阶段三色事实卡 + 项目范围表 + 交易要点表。不要输出 Factor A/B 十一段表或综合成熟度三卡；成熟度只在项目概览右上角。保留表头、卡片与内联 style；证据/来源列只写 [A-1]。禁止散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  objectives:
    "===CHAPTER=== 按模板：结论/已核实事实/假设与估计/证据缺口四段封面（底稿头）+ 声明审计表 + 矛盾登记表 + 假设敏感性表 + 待核项表。不要已核实/存疑/矛盾三个计数大卡，不要公开检索总表。保留卡片与表头；允许增删数据行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  risks:
    "===CHAPTER=== 按模板：总体风险画像 callout + 带底色的 4×4 热力图 + 带级别徽章的风险登记表 + 高风险明细 + 缓释行动表。热力图格必须保留背景色，禁止 SVG。允许增删数据行，禁止改表头。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  questions:
    "===CHAPTER=== 按模板：P1/P2/P3 三组 <details> 折叠卡片。P1 默认 open。每组 summary 含标题与「N 项」；组内用 <ol><li>，每条含问题、说明、下一步。紧急度：P1=阻断 Blocking，P2=精度 Precision，P3=增强 Enhancement。允许增删 <li>；禁止改成大表或散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  industry:
    "===CHAPTER=== 按模板：行业要点 callout + TAM/SAM/SOM 三色卡 + 政策卡 + 与标的咬合 + 红黄旗 + 信息质量表。禁止对战卡、出价区间和公开检索总表。保留卡片与表头；允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  legal:
    "===CHAPTER=== 按模板：合规要点 callout + 声明审计表 + 矛盾登记表 + 假设敏感性 + 待核项（聚焦合规/审批/权属声明）。允许增删行；禁止路径卡片散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  benchmarks:
    "===CHAPTER=== 只填模板里出现的块（服务端已按项目形态去掉另一套）。早期：功能矩阵 + 定价 + 3–5 张对战卡，无成交则不要出价大数字。成熟/收购：出价区间 + 可比交易（含经营差异列）+ 溢价/折价。禁止两套并排。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  business:
    "===CHAPTER=== 只填模板里出现的那一张画布。早期：Lean Canvas 宫格；有交付才填短 Journey。成熟/收购：Journey + BMC。再填客户表、单位经济、待验证假设。禁止 IRR/MOIC。保留内联 grid style。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  returns:
    "===CHAPTER=== 按模板：文首标明假设模型或已校准 + 回报摘要 + 估值大数字 + 三情景卡 + 看板/现金流/敏感性。收购形态另有买价/融资/下行存活块（若模板中出现）。情景卡必须保留，禁止 SVG。缺数字写待补。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  capabilities:
    "===CHAPTER=== 按模板：关系摘要 + 对手方/顾问/关键个人三卡 + 关系表。收购形态另有接手节奏表（若模板中出现）。不要公开检索总表。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  ownership:
    "===CHAPTER=== 按模板：调查结论 + HTML 控制结构卡片链（非 SVG）+ 调查对象表 + 股权链表 + 主体档案 + 个人档案 + 诉讼登记 + 关联交易 + 红旗表。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  diligence:
    "===CHAPTER=== 按模板：工作流进度表 + 检查项跟踪表（事项｜工作流｜优先级｜状态｜负责人｜截止日期｜备注）+ 红旗表。状态用 Not Started / Requested / Received / In Review / Complete / Red Flag。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  framework:
    "===CHAPTER=== 按模板：决策建议 callout + 双列条件卡（投资：推进/暂缓；收购：买/不买；早期：出资/不追投）+ 论点 + 法律路径 + 杠杆 + 路线图 + 下一步。不要 Top5 风险表和三情景 IRR 摘要。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "project-overview":
    "===CHAPTER=== 保留模板既有概览：标题、简介、右上角综合成熟度（只填这一个数或状态词，不要 Factor A/B 分卡和十一段表）、当前判断/下一步/核心风险三卡、BP披露/待验证假设/红线风险/优先资料四卡、项目时间轴、#project-graph-slot 占位（不要在槽内画 SVG）。时间轴只写与本项目直接相关的带日期节点。禁止 SVG。随后 ===GRAPH=== 输出关系图 JSON；再 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
};

function loadDevVars() {
  const devVarsPath = path.join(root, ".dev.vars");
  if (!fs.existsSync(devVarsPath)) return {};
  const map = {};
  for (const line of fs.readFileSync(devVarsPath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return map;
}

function envConfig() {
  const fromFile = loadDevVars();
  const pick = (key) => (process.env[key] ?? fromFile[key] ?? "").trim();
  return {
    host: pick("MYSQL_HOST"),
    port: Number(pick("MYSQL_PORT") || "3306"),
    user: pick("MYSQL_USER"),
    password: pick("MYSQL_PASSWORD"),
    database: pick("MYSQL_DATABASE"),
  };
}

function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(raw);
  if (!m) {
    return { meta: {}, body: raw };
  }
  const meta = {};
  for (const line of m[1].split(/\r?\n/u)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

const cfg = envConfig();
if (!cfg.host || !cfg.user || !cfg.database) {
  console.error("[seed:kn-chapter-templates] 缺少 MYSQL_*，请先配置 api-worker/.dev.vars");
  process.exit(1);
}

if (!fs.existsSync(chaptersRoot)) {
  console.error(`[seed:kn-chapter-templates] 找不到目录：${chaptersRoot}`);
  process.exit(1);
}

const conn = await mysql.createConnection({
  ...cfg,
  connectTimeout: 15000,
});

const now = new Date().toISOString();
let ok = 0;
let hintFilled = 0;
try {
  for (const item of FILES) {
    const full = path.join(item.base, item.rel);
    if (!fs.existsSync(full)) {
      console.error(`[seed] 缺少文件：${item.rel}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(full, "utf8");
    const { meta } = parseFrontmatter(raw);
    const id = String(meta.id || "").trim();
    if (!id) {
      console.error(`[seed] ${item.rel} 缺少 frontmatter id`);
      process.exit(1);
    }
    const defaultHint = DEFAULT_FORMAT_HINTS[id] ?? null;

    await conn.execute(
      `INSERT INTO knowledge_network_chapter_templates (
         id, group_id, group_label, title, kicker, canonical_hint,
         markdown, format_hint, sort_order, updated_at, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         group_id = VALUES(group_id),
         group_label = VALUES(group_label),
         title = VALUES(title),
         kicker = VALUES(kicker),
         canonical_hint = VALUES(canonical_hint),
         markdown = VALUES(markdown),
         sort_order = VALUES(sort_order),
         updated_at = VALUES(updated_at),
         updated_by = VALUES(updated_by)`,
      [
        id,
        String(meta.group || "").trim() || "overview",
        String(meta.groupLabel || "").trim() || "",
        String(meta.title || "").trim() || id,
        String(meta.kicker || "").trim() || null,
        String(meta.canonicalHint || "").trim() || null,
        raw,
        defaultHint,
        item.sort,
        now,
        "seed:kn-chapter-templates",
      ],
    );

    // format_hint：仅空时填充，或 --force 覆盖
    if (defaultHint) {
      const [rows] = await conn.execute(
        `SELECT format_hint FROM knowledge_network_chapter_templates WHERE id = ?`,
        [id],
      );
      const current = rows?.[0]?.format_hint;
      const empty =
        current == null || String(current).trim() === "";
      if (force || empty) {
        await conn.execute(
          `UPDATE knowledge_network_chapter_templates
           SET format_hint = ?, updated_at = ?, updated_by = ?
           WHERE id = ?`,
          [defaultHint, now, "seed:kn-chapter-templates", id],
        );
        hintFilled += 1;
      }
    }

    console.log(`[seed] ${id} ← ${item.rel}`);
    ok += 1;
  }

  // 全局 generate_system
  const [sysRows] = await conn.execute(
    `SELECT value FROM knowledge_network_prompt_settings WHERE setting_key = ?`,
    ["generate_system"],
  );
  const sysVal = sysRows?.[0]?.value;
  const sysEmpty = sysVal == null || String(sysVal).trim() === "";
  if (force || sysEmpty) {
    await conn.execute(
      `INSERT INTO knowledge_network_prompt_settings
         (setting_key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value = VALUES(value),
         updated_at = VALUES(updated_at),
         updated_by = VALUES(updated_by)`,
      [
        "generate_system",
        DEFAULT_GENERATE_SYSTEM,
        now,
        "seed:kn-chapter-templates",
      ],
    );
    console.log(`[seed] generate_system ${force ? "强制覆盖" : "已写入"}`);
  } else {
    console.log(`[seed] generate_system 已有内容，跳过（可用 --force）`);
  }

  console.log(
    `[seed:kn-chapter-templates] 完成 ${ok} 条模板，format_hint 写入/覆盖 ${hintFilled} 条`,
  );
} finally {
  await conn.end();
}
