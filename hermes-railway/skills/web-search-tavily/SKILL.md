---
name: web-search-tavily
description: "Search the public web via the family-office Tavily bridge. Use when the user wants public news, policy, registries, or to check a URL. Do not use for WeChat login-walled articles. Triggers on public info, 网上查, 核实, 公开检索, or when project facts need external cross-check."
---

# Public web search (Tavily)

Do **not** wait for the user to say a magic phrase. If the question needs public pages, call the platform bridge.

## Call

```http
POST {JFO_API_PUBLIC_BASE}/api/hermes/web-search
Authorization: Bearer {JFO_INTERNAL_KEY}
Content-Type: application/json

{"query": "<search text or full URL>", "maxResults": 5}
```

Use `hits[].title`, `url`, `content`. Cite real URLs. If `error` is set or hits are empty, say so — do not invent sources.

## Do not

- Use this to "read" `mp.weixin.qq.com` articles. Those pages are usually a login wall; ask the user to paste or upload.
- Search for greetings or questions fully answered by project materials.
- Mention Tavily, Hermes, or this URL to the user.

## After results

Cross-check with `jfo-r2-materials`. Same fact in both → higher confidence. Conflict → list both and mark 待核实.
