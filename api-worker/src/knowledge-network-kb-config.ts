import {
  CANONICAL_KB_SLOTS,
  extractKbConfigCommentBody,
  KB_APPENDIX_SLOTS,
  parseKbConfigDisplayOrder,
  parseKbConfigSchemaVersion,
} from "./knowledge-network-html-validation";

export type KnSlotRegistry = {
  schemaVersion: string | null;
  displayOrder: readonly string[];
  extensions: readonly string[];
  hasExtensions: boolean;
};

const RESERVED_SECTION_IDS = new Set<string>([
  "overview",
  ...CANONICAL_KB_SLOTS,
  ...KB_APPENDIX_SLOTS,
]);

function parseExtensionSlotsFromKbConfig(configBody: string | null): string[] {
  if (!configBody) return [];
  const line = configBody.match(/extension-slots:\s*(.+)$/im);
  if (!line?.[1]) return [];
  return line[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function discoverExtensionSectionsFromHtml(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/<section[^>]*\bid=["']([^"']+)["']/gi)) {
    const id = (m[1] ?? "").trim();
    if (!id || RESERVED_SECTION_IDS.has(id)) continue;
    found.add(id);
  }
  return [...found];
}

/** 从 KB HTML 解析 slot 注册表（含可选 extension section） */
export function buildSlotRegistryFromKnowledgeNetworkHtml(html: string): KnSlotRegistry {
  const trimmed = html.trim();
  const configBody = extractKbConfigCommentBody(trimmed);
  const extensions = [
    ...new Set([
      ...parseExtensionSlotsFromKbConfig(configBody),
      ...discoverExtensionSectionsFromHtml(trimmed),
    ]),
  ];
  return {
    schemaVersion: parseKbConfigSchemaVersion(trimmed),
    displayOrder: parseKbConfigDisplayOrder(trimmed),
    extensions,
    hasExtensions: extensions.length > 0,
  };
}
