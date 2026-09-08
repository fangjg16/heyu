---
name: jfo-r2-materials
description: "Hermes bridge to 联合家办 platform materials (MinIO/MySQL via JFO API). Search the already-parsed chunk cache first; fetch full file bodies only when the cache cannot answer. Use before project-intake, knowledge-base-generation, dd, valuation, or any skill needing uploaded evidence. scope=all = package + current conversation session attachments."
version: 1.3.0
metadata:
  hermes:
    tags: [family-office, jfo, r2, materials]
    category: integration
---

# JFO Platform · Materials Bridge

Website uploads live in **MinIO + MySQL**, exposed to Hermes via **JFO API `/api/hermes/*`**, not in a Cowork local project folder.

Upload already runs parse/OCR → `chunks`. That cache **is** the project memory. Do **not** re-read every file on every turn.

This skill is: **search parsed cache → answer if enough → targeted textUrl only for gaps**.

## Platform reading policy (Worker instructions align)

1. **Greetings / off-topic**: answer immediately. No search, no textUrl.
2. **Project facts**: `GET .../search?q=` (parsed chunks). Treat `hits[].text` as already read.
3. **Gaps only**: if cache misses a clause/number, `GET manifest` then `GET textUrl` for **that file**.
4. **Never** download every `parsed=true` file. Never conclude from filenames alone.
5. **Session priority**: if user uploaded in chat, search `scope=all` (or `session`) — not package-only.
6. **scope=all** = project package **plus** current `userId` + `conversationId` session attachments.

## Required environment

| Variable | Example |
|----------|---------|
| `JFO_API_PUBLIC_BASE` | `https://jfo-api.jfo-api.workers.dev` (Worker should inject the **internal** base) |
| `JFO_INTERNAL_KEY` | same as Worker secret `JFO_INTERNAL_KEY` |
| `JFO_DEFAULT_USER_ID` | `jensen-fang` (uploader account id on the website) |

## Step 1 — Resolve projectId, userId, conversationId

From the user message / Worker instructions, extract:

- **projectId** — e.g. `nn-fresh-port` (南宁生鲜港)
- **userId** — uploader account id; default `JFO_DEFAULT_USER_ID`
- **conversationId** — current dialogue id (when user uploads files **in chat**)

**Two scopes:**

| scope | Meaning | Who sees it |
|-------|---------|-------------|
| `package` | 项目资料包（项目总览上传） | 全项目共享 |
| `session` | 本对话内上传的附件 | 仅该 userId + conversationId |

**When the user just uploaded a PDF in the dialogue**, you **must** search `scope=session` or `scope=all`. Do **not** only search `scope=package`.

## Step 2 — Search parsed cache (default)

```http
GET {JFO_API_PUBLIC_BASE}/api/hermes/projects/{projectId}/search?q={question}&scope=all&userId={userId}&conversationId={conversationId}
Authorization: Bearer {JFO_INTERNAL_KEY}
```

Or POST:

```http
POST {JFO_API_PUBLIC_BASE}/api/hermes/projects/{projectId}/search
Authorization: Bearer {JFO_INTERNAL_KEY}
Content-Type: application/json

{"query":"<用户问题>","scope":"all","userId":"{userId}","conversationId":"{conversationId}"}
```

Parse `hits[]`. If they cover the question, **stop reading files** and answer. Worker may also pre-inject the same cache as 【资料摘录】 — treat that as already searched.

## Step 3 — Manifest + textUrl only for gaps

Use manifest when you need the file list, or when search hits are not enough.

**Project package only (shared):**

```http
GET {JFO_API_PUBLIC_BASE}/api/hermes/projects/{projectId}/manifest?scope=package
Authorization: Bearer {JFO_INTERNAL_KEY}
```

**Current dialogue attachments (required when user uploaded in chat):**

```http
GET {JFO_API_PUBLIC_BASE}/api/hermes/projects/{projectId}/manifest?scope=session&userId={userId}&conversationId={conversationId}
Authorization: Bearer {JFO_INTERNAL_KEY}
```

**Both package + current dialogue:**

```http
GET {JFO_API_PUBLIC_BASE}/api/hermes/projects/{projectId}/manifest?scope=all&userId={userId}&conversationId={conversationId}
Authorization: Bearer {JFO_INTERNAL_KEY}
```

Then pull **only** bodies needed for the current gap:

| Task | Read |
|------|------|
| short Q&A | search only; textUrl if cache misses |
| project_intake / initial or full KB | search first; textUrl for core diligence files still uncovered |
| incremental KB | Current KB + search for named slots + new session uploads |
| reorder KB | **Current KB only** — no package/session bodies |
| ic_memo | Current KB first; search cache; raw files only if still missing key facts |
| valuation / risk / dd | Current KB + search; textUrl for financial/legal gaps |
| public_info_search | search + KB as context; then external search |

```http
GET {textUrl from manifest — selected files only}
Authorization: Bearer {JFO_INTERNAL_KEY}
```

For `parsed: false`, note filename and ask user to re-upload as .txt/.md or text-based PDF.

## Step 4 — Hand off to other skills

1. **Prioritize session attachments** when the user just uploaded in the dialogue.
2. Run **project-intake** (if no KB) or **knowledge-base-generation** (update/reorder per mode).
3. Knowledge network HTML: `GET/PUT .../knowledge-network/current?format=raw` + ` ```html ` fallback in the same reply.
4. Do **not** claim files are inaccessible after search or manifest confirms they exist.
5. Do **not** read from `~/Projects/...` unless user explicitly added local copies (Cowork-only path; not this platform).

## Optional: curl one-liner (terminal tool)

```bash
# Parsed cache for this question
curl -s -H "Authorization: Bearer $JFO_INTERNAL_KEY" \
  --get --data-urlencode "q=冷库容量" \
  --data-urlencode "scope=all" \
  --data-urlencode "userId=$JFO_DEFAULT_USER_ID" \
  --data-urlencode "conversationId=YOUR_CONV_ID" \
  "$JFO_API_PUBLIC_BASE/api/hermes/projects/nn-fresh-port/search"
```

## Errors

| HTTP | Meaning |
|------|---------|
| 401 | `JFO_INTERNAL_KEY` mismatch — fix Railway/Worker secrets |
| 404 | Wrong projectId/documentId or userId |
| empty hits | Cache miss — retry query or targeted textUrl; greetings should not search |
| empty files (package) | No package uploads for that project |
| empty files (session) | Wrong userId/conversationId or upload not parsed yet |
