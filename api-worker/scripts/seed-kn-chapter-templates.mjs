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
  { rel: "overview/snapshot.md", sort: 10, base: chaptersRoot },
  { rel: "overview/objectives.md", sort: 20, base: chaptersRoot },
  { rel: "research/industry.md", sort: 30, base: chaptersRoot },
  { rel: "research/legal.md", sort: 40, base: chaptersRoot },
  { rel: "research/benchmarks.md", sort: 50, base: chaptersRoot },
  { rel: "structure/business.md", sort: 60, base: chaptersRoot },
  { rel: "structure/returns.md", sort: 70, base: chaptersRoot },
  { rel: "structure/capabilities.md", sort: 80, base: chaptersRoot },
  { rel: "structure/ownership.md", sort: 90, base: chaptersRoot },
  { rel: "structure/diligence.md", sort: 100, base: chaptersRoot },
  { rel: "risk/risks.md", sort: 110, base: chaptersRoot },
  { rel: "risk/questions.md", sort: 120, base: chaptersRoot },
  { rel: "risk/framework.md", sort: 130, base: chaptersRoot },
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
7. 若模板已含带 style 的 HTML 骨架：必须保留这些 style，只替换「待补」内容。
8. 事实必须来自附件摘录；缺依据写「待补」，禁止编造。
9. 标记外禁止任何说明文字。章节内图表用 HTML <table>（含热力图格子），禁止 SVG。关系图禁止输出 SVG/HTML，只输出 JSON。
10. 若用户消息含「分析方法」：只用来填模板中的「待补」；禁止改表头、禁止用分析方法里的示例表替换骨架、禁止改成散文。允许按资料增删数据行。版式以章节 Markdown 模板为准。`;

/** 与 project-knowledge-chapters-routes.ts SECTION_FORMAT_HINT 对齐 */
const DEFAULT_FORMAT_HINTS = {
  snapshot:
    "===CHAPTER=== 按模板：一句话范围 + 项目范围表 + 交易要点表。不要输出 Factor A/B 十一段表或综合成熟度三卡；成熟度只在项目概览右上角。保留表头与内联 style；证据/来源列只写 [A-1]。禁止散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  objectives:
    "===CHAPTER=== 按模板：公开检索档案表 + 声明审计表 + 矛盾登记表 + 假设敏感性表 + 待核项表。保留表头与内联 style；允许增删数据行；禁止改成门槛卡片或散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  risks:
    "===CHAPTER=== 按模板：总体风险画像 + 4×4 热力图表格 + 风险登记表 + 高风险明细 + 缓释行动表。热力图用 HTML 表，禁止 SVG。允许增删数据行，禁止改表头。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  questions:
    "===CHAPTER=== 按模板：P1/P2/P3 三组 <details> 折叠卡片。P1 默认 open。每组 summary 含标题与「N 项」；组内用 <ol><li>，每条含问题、说明、下一步。紧急度：P1=阻断 Blocking，P2=精度 Precision，P3=增强 Enhancement。允许增删 <li>；禁止改成大表或散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  industry:
    "===CHAPTER=== 按模板：公开检索档案（类别含监管审批/土地权属/市场数据/可比交易/政策/新闻）。保留表头；允许增删行；禁止四宫格散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  legal:
    "===CHAPTER=== 按模板：声明审计表 + 矛盾登记表 + 假设敏感性 + 待核项（聚焦合规/审批/权属声明）。允许增删行；禁止路径卡片散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  benchmarks:
    "===CHAPTER=== 按模板：筛选标准表 + 可比交易表 + 溢价/折价锚点表 + 估值区间表。允许增删可比行（约 3–8 条）；禁止改表头。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  business:
    "===CHAPTER=== 按模板：客户与付费方 + 收入与定价 + 成本与单位经济 + 履约/经营KPI + 待验证经营假设。写目标公司怎么赚钱，禁止 IRR/MOIC/投资人回报。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  returns:
    "===CHAPTER=== 按模板：三情景指标看板 + 年度现金流表 + 杠杆敏感性表 + 假设登记 + 单变量敏感性表 + 双变量表 + 情景矩阵 + 盈亏平衡表。图表用 HTML 表，禁止 SVG。缺数字写待补。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  capabilities:
    "===CHAPTER=== 按模板：公开检索档案（主体/股权/关系/舆情）+ 关系与对手方表。允许增删行；禁止三通道散文卡。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  ownership:
    "===CHAPTER=== 按模板：调查结论 + 主体档案表 + 个人档案表 + 诉讼登记 + 关联交易 + 红旗表。股权链用表格，禁止 SVG。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  diligence:
    "===CHAPTER=== 按模板：工作流进度表 + 检查项跟踪表（事项｜工作流｜优先级｜状态｜负责人｜截止日期｜备注）+ 红旗表。状态用 Not Started / Requested / Received / In Review / Complete / Red Flag。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  framework:
    "===CHAPTER=== 按模板：决策建议 + 投资论点 + 法律/交易结构路径 + 增值杠杆 + 执行路线图 + 下一步。不要 Top5 风险表和三情景 IRR 摘要。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "project-overview":
    "===CHAPTER=== 保留模板既有概览：标题、简介、右上角综合成熟度（只填这一个数或状态词，不要 Factor A/B 分卡和十一段表）、当前判断/下一步/核心风险三卡、BP披露/待验证假设/红线风险/优先资料四卡、项目时间轴。时间轴只写与本项目直接相关的带日期节点。禁止 SVG。随后 ===GRAPH=== 输出关系图 JSON；再 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
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
