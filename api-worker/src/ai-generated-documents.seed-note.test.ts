import { describe, expect, it } from "vitest";
import {
  isUnconsumedSeedFirstVersionNote,
  SEED_FIRST_VERSION_NOTE,
} from "./ai-generated-documents";

describe("seed first-version note", () => {
  it("only matches the unconsumed marker so the next 更新全部 can rewrite", () => {
    expect(isUnconsumedSeedFirstVersionNote(SEED_FIRST_VERSION_NOTE)).toBe(true);
    expect(
      isUnconsumedSeedFirstVersionNote(`${SEED_FIRST_VERSION_NOTE}:used`),
    ).toBe(false);
    expect(isUnconsumedSeedFirstVersionNote(null)).toBe(false);
    expect(isUnconsumedSeedFirstVersionNote("")).toBe(false);
  });
});
