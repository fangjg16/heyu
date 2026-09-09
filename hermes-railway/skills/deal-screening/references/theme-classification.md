# 赛道确认

Use in Phase 2. 根据标的的经济实质，从本 skill 附带的合域投资主题白名单中给出唯一主分类。本步回答「CapitalLens 投资分析把项目放在哪条赛道」，供筛选备忘录、后续尽调和检索沿用。它不是 `heyu-workspace` 的网站项目卡分类，不得覆盖 workspace `classification.json`。该坐标不是分数、淘汰条件或投资结论。

每次分类都读取：

- `taxonomy.md`：唯一有效的一级、二级标签。输出必须与白名单逐字一致。
- `decision-rules.md`：候选生成、强制裁决、证据优先级和边界规则。

不得新增、改写、合并或拆分白名单标签。资料再少也必须返回一个非空主分类。没有完全匹配时选择经济实质最接近的标签，匹配类型为 `closest`。

## 步骤

1. 从 intake 提取项目名称和可得内容。优先识别：实际产品或服务、付费客户、收入来源、计价方式、核心资产、价值链环节、本次投资范围和主要业务地区。
2. 用一句话重述经济实质：`标的通过[核心活动/资产]，向[客户]提供[产品/服务]，主要通过[收入来源]变现。` 缺失部分写“输入未说明”。
3. 区分投资对象与交易形式。股权投资、控股收购、基金、SPV、申报阶段本身都不是行业分类依据。
4. 不先锁定一级主题。从全部二级白名单提出 2–4 个跨一级候选，按核心交付物、收入计价、核心资产、价值链环节和客户场景比较；由胜出的二级反推一级。
5. 按 `decision-rules.md` 选出唯一主分类。至少说明一个最接近但未选的候选。
6. 标注 `exact | closest` 和 `高 | 中 | 低` 置信度。待确认问题写入开放问题候选，不把分类字段留空。

`closest` 或低置信度只说明坐标仍不稳定，不自动把总体 verdict 写成 `Watch` 或 `Pass`。会改变分类的问题列入后续开放问题。

正式尽调可以修正行业坐标；修正时必须引用本步的 `taxonomy_version` 并说明差异。

## 输出

`01-intake/theme-classification.md`：

```markdown
**主分类**：{一级主题板块} → {二级可投子赛道/业务环节}
**匹配类型 / 置信度**：{exact|closest} / {高|中|低}
**taxonomy_version**：{与 taxonomy.md 一致}
**经济实质**：{一句话；缺失事实写“输入未说明”}
**判断依据**：{2–4 条来自输入的事实或可识别线索}
**边界说明**：{最接近的其他候选及不选原因}
**待确认**：{仅列会改变分类的 0–3 个问题；没有则写“无”}
```

同时写入 `01-intake/investment-theme-coordinate.json`：

```json
{
  "taxonomy_version": "2026-08-26-r2",
  "project_name": "",
  "classification_status": "classified",
  "match_type": "exact | closest",
  "primary": {
    "theme": "",
    "subsector": ""
  },
  "secondary": [],
  "confidence": "high | medium | low",
  "economic_essence": "",
  "evidence": [],
  "boundary_note": "",
  "open_questions": []
}
```

`primary.theme` 与 `primary.subsector` 必须是白名单中的非空字符串。
