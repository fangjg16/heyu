# 知识网络章节模板

现行种子在 `mature/`、`early/`、`acquire/`，id 与当前目录 tab 一致。呈现 class 见前端 `src/styles/kn-elements.css`。

旧 13 格 Markdown（`overview/`、`research/`、`structure/`、`risk/`）仍会 seed，仅供历史章节改写，不再作为新生成目录。

```powershell
cd api-worker
npm run seed:kn-chapter-templates -- --force
```

| 形态 | 目录 |
|------|------|
| 投资 | [mature/](mature/) |
| 收购 | [acquire/](acquire/) |
| 创业 | [early/](early/) |
| 概览 | [../project-overview.md](../project-overview.md) |

生成时只替换「待补」，保留 class。对不上专属呈现的内容用表。创业无材料时只保留「尚未开展」。市场规模三数用「总市场 / 可服务市场 / 可获得份额」。
