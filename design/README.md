# 合域 · 品牌设计规范（Brand Kit）

投研工作台原型对齐版（v2）的视觉单一事实来源。

## 预览

**推荐：直接打开（无需 npm、无需服务器）**

- 双击 `design/brand-kit.html`，或
- 双击 `design/打开品牌规范.bat`

`brand-kit.html` 已**内联** `brand-tokens.css`（毛玻璃、色板变量、`.glass-bohemian*`），可**只下载这一个 HTML 文件**离线打开，效果与整包一致。仅需联网加载 Google 字体（Noto Serif / Sans SC）。

修改 `brand-tokens.css` 后请运行：

```bash
pnpm brand-kit:bundle
```

会同步更新 `design/brand-kit.html` 与 `public/design/brand-kit.html`。

**可选**：若已在跑 `npm run dev`，也可访问  
`http://localhost:5173/family-office-platform/design/brand-kit.html`  
（`public/design/` 为同一份副本，方便和主站一起预览，并非必须）。

## 文件

| 文件 | 说明 |
|------|------|
| `brand-kit.html` | 给老板/设计评审用的完整规范页 |
| `brand-tokens.css` | CSS 变量与 `.glass-bohemian` 工具类；改版时同步到 `src/index.css` |
| `optical-alignment.md` | **光学对齐**备忘：圆/文/图标/毛玻璃的 visual center 调参规则 |

## 已定稿要点

- 主色：经典酒红 **#A06358**（`hsl(5 32% 46%)`）；hover **#8F564C**；深档 **#722F37**
- 页面底 **#F6F1E8**（亚麻）；墨色暖炭 **hsl(25 18% 18%)**
- 辅色：陶土 `#B8876F`；鼠尾草 `#5A735F`
- 衬线：**Noto Serif SC**（标题）；正文 **Noto Sans SC**
- 工作台：左侧可折叠导航轨 + 顶栏面包屑（无移动端预览切换）
- 正文卡片：毛玻璃（高透明、强模糊、清晰描边）
