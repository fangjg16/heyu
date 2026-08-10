# 后台数据清理指南（MySQL + MinIO）

演示/测试环境的数据分布在 **MySQL 8** 与 **MinIO** 两处：

| 存储 | 内容 |
|------|------|
| **MySQL** | 项目元数据、文档索引、分块、对话同步、agent_jobs |
| **MinIO** | 上传的原始 PDF/附件、知识网络 HTML（对象 key 存于 MySQL `r2_key` 列） |

网页**没有**「一键清空」按钮，需通过 **MySQL 客户端** 与 **MinIO 控制台 / mc CLI** 操作。

---

## 零、准备

连接信息见 `local.dev.secrets.env` 或 K8s Secret 中的 `MYSQL_*`、`MINIO_*`。

```powershell
# 示例：mysql 命令行
mysql -h YOUR_HOST -P 3306 -u YOUR_USER -p YOUR_DATABASE
```

演示账号在 MySQL `workspace_users`（`id` + 唯一 `username`；种子 `npm run seed:workspace-users`）；登录经 `POST /api/auth/login`（如 `jimmyhuang`）。

---

## 一、只删某个账号的数据（推荐）

把下面 SQL 里的 `YOUR_USER_ID` 换成真实 id（与登录账号一致）。

### 1. 删除该账号上传的所有资料 + 分块

```sql
DELETE FROM chunks WHERE document_id IN (
  SELECT id FROM documents WHERE uploaded_by = 'YOUR_USER_ID'
);
DELETE FROM documents WHERE uploaded_by = 'YOUR_USER_ID';
```

### 2. 删除该账号云端对话记录

```sql
DELETE FROM user_chat_messages WHERE user_id = 'YOUR_USER_ID';
DELETE FROM user_conversations WHERE user_id = 'YOUR_USER_ID';
```

### 3. 删除 MinIO 中该账号的对象

对象路径通常含 `users/YOUR_USER_ID`。在 MinIO 控制台浏览 bucket，或使用 `mc`：

```bash
mc rm --recursive --force alias/bucket/projects/*/users/YOUR_USER_ID/
```

> **说明**：只删 MySQL 不删 MinIO 会留「孤儿对象」；只删 MinIO 不删 MySQL 会导致列表仍有记录但下载失败。建议 **MySQL + MinIO 一起清**。

---

## 二、只删某个项目

```sql
DELETE FROM chunks WHERE document_id IN (
  SELECT id FROM documents WHERE project_id = 'YOUR_PROJECT_ID'
);
DELETE FROM documents WHERE project_id = 'YOUR_PROJECT_ID';
DELETE FROM user_chat_messages WHERE conversation_id LIKE 'YOUR_PROJECT_ID%';
DELETE FROM user_conversations WHERE project_id = 'YOUR_PROJECT_ID';
DELETE FROM agent_jobs WHERE project_id = 'YOUR_PROJECT_ID';
```

MinIO：删除前缀 `projects/YOUR_PROJECT_ID/` 下全部对象。

---

## 三、清空所有上传资料

```sql
DELETE FROM chunks;
DELETE FROM documents;
-- 可选：清空对话
DELETE FROM user_chat_messages;
DELETE FROM user_conversations;
```

MinIO：清空 bucket 内 `projects/` 前缀（或整桶，⚠️ 不可恢复）。

---

## 四、查看现状（不删）

```sql
SELECT uploaded_by, project_id, scope, filename, created_at
FROM documents ORDER BY created_at DESC LIMIT 30;

SELECT user_id, COUNT(*) AS n FROM user_conversations GROUP BY user_id;

SELECT status, COUNT(*) AS n FROM agent_jobs GROUP BY status;
```

MinIO：在控制台查看 bucket 占用与 `projects/` 目录结构。

---

## 五、本机浏览器缓存

换电脑不同步、想清本地演示状态时：

- 浏览器 → 清除本站点的 **localStorage**（`fo-chat-*` 开头 key）
- 或无痕窗口重新登录

这**不会**删除 MySQL/MinIO 上的云端数据。

---

## 六、快速对照

| 你想… | 做法 |
|--------|------|
| 某账号重来 | 第一节 SQL + MinIO 删 `users/该账号/` |
| 某项目资料重来 | 第二节 |
| 演示环境全部重置 | 第三节 |
| 只清对话、保留文件 | 只执行 `user_chat_*` 的 DELETE |
| 只清文件、保留对话 | 只执行 `documents` / `chunks` + MinIO |
