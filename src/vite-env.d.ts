/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 设为 `1` / `true` 且配置 `VITE_AI_CHAT_ENDPOINT` 时启用真实 AI 对话 */
  readonly VITE_ENABLE_LIVE_CHAT?: string;
  /** JFO API：`https://你的-api-域名/api/chat` */
  readonly VITE_AI_CHAT_ENDPOINT?: string;
  readonly VITE_RAGFLOW_CHAT_ENDPOINT?: string;
  readonly VITE_RAGFLOW_MODE?: string;
  readonly VITE_RAGFLOW_API_KEY?: string;
  /** Clerk Publishable Key（`pk_...`）；未设时登录页仅支持已有账号密码 */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}
