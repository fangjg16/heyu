import type { AppObjectStorage } from "./app-storage";
import {
  buildSlotRegistryFromKnowledgeNetworkHtml,
  type KnSlotRegistry,
} from "./knowledge-network-kb-config";

export type KnSlotRegistryStoreEnv = { FILES: AppObjectStorage };

function projectKnSlotRegistryKey(projectId: string): string {
  return `projects/${projectId}/kn-slot-registry.json`;
}

export async function loadProjectKnSlotRegistry(
  env: KnSlotRegistryStoreEnv,
  projectId: string,
): Promise<KnSlotRegistry | null> {
  try {
    const obj = await env.FILES.get(projectKnSlotRegistryKey(projectId));
    if (!obj) return null;
    const parsed = JSON.parse(await obj.text()) as KnSlotRegistry;
    if (!parsed || !Array.isArray(parsed.extensions)) return null;
    return {
      schemaVersion: parsed.schemaVersion ?? null,
      displayOrder: parsed.displayOrder ?? [],
      extensions: parsed.extensions,
      hasExtensions: parsed.extensions.length > 0,
    };
  } catch {
    return null;
  }
}

export async function saveProjectKnSlotRegistry(
  env: KnSlotRegistryStoreEnv,
  projectId: string,
  registry: KnSlotRegistry,
): Promise<void> {
  await env.FILES.put(projectKnSlotRegistryKey(projectId), JSON.stringify(registry), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** 优先读对象存储缓存；否则从当前 KB HTML 解析 */
export async function resolveProjectKnSlotRegistry(
  env: KnSlotRegistryStoreEnv,
  projectId: string,
  existingHtml?: string | null,
): Promise<KnSlotRegistry | null> {
  const stored = await loadProjectKnSlotRegistry(env, projectId);
  if (stored) return stored;

  const html = (existingHtml ?? "").trim();
  if (!html) return null;
  return buildSlotRegistryFromKnowledgeNetworkHtml(html);
}
