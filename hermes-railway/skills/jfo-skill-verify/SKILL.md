---
name: jfo-skill-verify
description: "本地/联调用：验证 Admin 同步到卷并重启 Gateway 后 skill 是否生效。触发词：测试skill、skill验证、验证新skill、VERIFY-SKILL、jfo-skill-verify。"
---

# JFO Skill Verify（联调探针）

仅用于验证「编辑 → MySQL → 文件卷 → 重启 Hermes → 对话命中」整条链路，**不是**业务交付 skill。

## When Invoked

用户说含以下字样之一时触发（由 Worker 意图路由）：

- `测试skill` / `测试 Skill`
- `skill验证` / `验证新skill`
- `VERIFY-SKILL` / `jfo-skill-verify`

## 强制输出（验收标准）

1. 回复**第一行必须恰好**是：

```text
[VERIFY-SKILL-OK]
```

2. 第二行起用简体中文写 2～4 句，说明：
   - 本探针 skill 已加载；
   - 当前时间用 ISO 日期（无需精确到秒）；
   - 请用户确认看到了第一行标记。

3. **禁止**：长篇项目分析、生成知识网络 HTML、提及 Hermes / skill 目录名以外的实现细节（可写「联调探针已生效」）。

## 约束

- 用简体中文
- 不要读取大段项目资料；本任务不依赖资料包
- 不要暴露内部实现路径
