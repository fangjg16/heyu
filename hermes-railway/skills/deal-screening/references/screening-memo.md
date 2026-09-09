# Screening Memo

Use in Phase 6. Write `02-screening/screening-memo.md`. Follow `references/shared/output-contracts.md`. Default artifact status: `indicative` or `working`. Write the memo in the user's language: title, headings, table headers, labels, and body must match. Translate remaining English labels in this template (dimension names, Verdict, Suggested next step) when the user writes in another language.

## Verdict

Roll the three dimensions into one label. This is not a yes/no and not a mandate-fit call.

| Verdict | Meaning | Typical suggested next step |
|---|---|---|
| `Exciting` | Core dimensions are mostly `meets`, none are `misses`; remaining questions are unlikely to reverse the view on their own | `continue_diligence` |
| `Promising` | The story holds; `meets` and `partially_meets` coexist; no single `misses` that should stop work now | `continue_diligence`, or `request_information` on the blocking questions |
| `Watch` | Formal diligence is not justified now: window not here, too early, position unclear, business still unreadable, or a key dimension unevaluated | `request_information`, or wait for a named catalyst; pipeline stays `deal-screening` |
| `Pass` | Available evidence supports not spending diligence time now: at least one blocking `misses`, or a public hard stop | suggest the team set pipeline to `declined` |

Rollup rules:

1. Not a weighted average. A `misses` that alone changes “diligence now?” caps the verdict at `Watch`. Integrity, unresolved identity, or a public hard stop may cap the suggestion at `Pass`.
2. Key dimensions unevaluated and no `misses` cannot produce `Pass`. The honest outlet is `Watch` plus open questions.
3. `Pass` needs a rejection reason. `Watch` needs what to ask or what to wait for. `Exciting` / `Promising` need the first tests diligence should run.
4. Verdict and suggested next step are inputs. Suggested next step is one of `continue_diligence`, `request_information`, `pass`.

Do not fill the team-decision block. Do not set `pipelineStatus` to `declined` or `due-diligence`.

## Template

```markdown
# 筛选备忘录：{项目名称}

- 项目与视角：{name} / financial-investor
- 工作流与状态：deal-screening / working
- 工件状态：indicative
- 日期与输入：{date}；{sources}
- 决策问题：现在是否值得启动正式尽调？
- pipelineStatus：deal-screening

## 1. 项目身份与经济实质

{一句话。缺失写“输入未说明”。}

## 2. 赛道

- 主分类：{一级} → {二级}
- 匹配类型 / 置信度：
- taxonomy_version：

## 3. 公开补充要点

- 市场与 timing：
- 竞争与位置：
- 客户与需求：
- 渠道与进入：
- 与材料一致 / 冲突：

## 4. 分维评分

| 维度 | 结论 | 证据（source ID） | 理由 |
|---|---|---|---|
| Market timing | meets / partially_meets / misses / 未评 |  |  |
| Competitive positioning | meets / partially_meets / misses / 未评 |  |  |
| Team / founder quality | meets / partially_meets / misses / 未评 |  |  |

## 5. 总体叙事

- 什么成立：
- 什么存疑：
- 什么不合理：

## 6. Agent 建议

- Verdict：Exciting / Promising / Watch / Pass
- Suggested next step：continue_diligence / request_information / pass
- 若 Pass，拒绝原因：
- 若进入尽调，优先测试：

## 7. 开放问题（给被投方）

### 不清楚

1. 问什么：
   - 为什么现在问：
   - 怎样才算答上：
   - 不答的后果：

### 不合理

1. 问什么：
   - 为什么现在问：
   - 怎样才算答上：
   - 不答的后果：

## 8. 可比项目

未评估（本轮不做）。

## 9. 网络关系

未评估（本轮不做）。

## 10. 来源

- SRC-…

## 11. Flags

- Red：
- Yellow：
- 或：No flags identified

## 12. 团队决定（人工填写）

- 决定：continue / 追问或观察 / 本阶段放弃
- 理由：
- 记录人 / 日期：
- pipelineStatus 更新为：
```

## Phase 7

When a person records a decision, fill section 12, append to `decisions[]`, and update `pipelineStatus`:

- `continue` → `due-diligence`
- 追问或观察 → remain `deal-screening`
- 本阶段放弃 → `declined`

The team may override the agent. Write the human reason. Only a recorded `continue` (or an explicit skip of screening requested by the user inside `due-diligence`) starts formal diligence workpapers.
