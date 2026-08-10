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
const knRoot = path.join(repoRoot, "docs", "knowledge-network");
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
1. 模板有什么结构与内联 style，输出就保留什么；禁止增加模板中不存在的章节（尤其禁止「填写指引」、长篇前言、页外说明）。
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
5. 凡表格「证据/来源」列：单元格内**只输出**引用标记如 [A-1]，禁止「项目方整理」「BP称」等说明文字；多个引用用空格分隔。
6. 表格表头须可单行完整显示（勿把长表头拆成多行文字）。
7. 若模板已含带 style 的 HTML 骨架：必须保留这些 style，只替换「待补」内容。
8. 事实必须来自附件摘录；缺依据写「待补」，禁止编造。
9. 标记外禁止任何说明文字。关系图禁止输出 SVG/HTML，只输出 JSON。`;

/** 与 project-knowledge-chapters-routes.ts SECTION_FORMAT_HINT 对齐 */
const DEFAULT_FORMAT_HINTS = {
  snapshot:
    "===CHAPTER=== 下一张三列表（项目项｜内容｜证据/来源）；「项目项」列文字单行完整显示（勿换行）；证据/来源列只写 [A-1] 等引用标记，禁止其它说明文字。表头单行完整显示。随后 ===SOURCES_ADD===（六列，仅新 ID）与 ===GLOSSARY_ADD===（仅非常用缩写/术语）。",
  objectives:
    "===CHAPTER=== 必须原样保留模板中的 HTML 结构与内联 style（尤其门槛卡片的金底边框样式），只替换「待补」为事实。门槛块必须是：margin-top:22px;padding:15px 17px;background:rgba(213,154,47,0.08);border:1px solid rgba(213,154,47,0.25)；标题 color:#B07d1f。禁止改成 callout/卡片阴影/h3 散文。最后一行「来源：…」用 font-size:12px;color:#59625F。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  risks:
    "===CHAPTER=== 只输出一张风险矩阵 HTML <table>（级别｜风险｜证据｜缓释），表格外禁止任何文字。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  questions:
    "===CHAPTER=== 严格按模板：三个 <details> 分组（P1/P2/P3），每组内为编号问题段落；保留内联 style；禁止改成研究结论散文或五列表格。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  industry:
    "===CHAPTER=== 严格按模板 HTML 骨架输出（对齐 BPC 行业分析版式）：①产品/标的背景表 ②作用机制四宫格+纠偏条 ③产品形态对比表 ④市场规模表(指标|数据|来源) ⑤供给侧参与方表 ⑥监管/行业时间线。保留模板内联 style；只替换「待补」；禁止改成「研究结论+关键发现」三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  legal:
    "===CHAPTER=== 严格按模板（对齐 BPC 合规分析）：监管前提红条 + 路径总览表 + 路径一闭环表 + 角色定位表 + 政策窗口提示 + 路径二表 + 执法风险提示 + 资质表 + 建议行动表 + 待审查清单。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  benchmarks:
    "===CHAPTER=== 严格按模板（对齐 BPC 对标分析）：范围说明条 + 对标组表 + 运营范式表/风险条 + 定价层级表。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  business:
    "===CHAPTER=== 严格按模板（对齐 BPC 业务模式）：导语 + 路径总览表 + 路径详情卡片（客群/单位经济/前提/可行性）+ 信息缺口条。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  returns:
    "===CHAPTER=== 严格按模板（对齐 BPC 财务与回报）：前置条件缺口条 + 参考利润结构表（非正式 IRR）。保留内联 style；禁止编造正式回报数字。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  capabilities:
    "===CHAPTER=== 严格按模板（对齐 BPC 资源网络）：通道 A/B/C 三张「维度|内容|可信度」表 + 缺乏资料清单条。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  ownership:
    "===CHAPTER=== 严格按模板：结构状态条 + 主体控制权表 + 合同权利表。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  diligence:
    "===CHAPTER=== 严格按模板：导语 + 尽调覆盖度表 + 优先补齐清单表。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  framework:
    "===CHAPTER=== 严格按模板（对齐 BPC 决策框架）：导语 + 路径比较矩阵 + 推荐逻辑卡片 + 行动清单表 + 无法出具正式建议条。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "project-overview":
    "===CHAPTER=== 必须原样保留模板 HTML（含「项目时间轴」卡片网格）：判断标题、简介、成熟度、当前判断、下一步、核心风险、四块摘要、时间轴。时间轴只写与本项目直接相关的带日期节点；状态可用已发生/已取得/待核验/待完成/计划/项目方披露等。禁止增加 SVG 关系图。随后 ===GRAPH=== 输出关系图 JSON（禁止 SVG）；再 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
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
