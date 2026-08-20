import { describe, expect, it } from "vitest";
import {
  CHAPTER_GENERATE_CONCURRENCY,
  shouldFailStalePendingItems,
  startDraftRunProcessor,
  withChapterGenerateGate,
} from "./chapter-draft-generate-queue";

describe("shouldFailStalePendingItems", () => {
  const staleMs = 20 * 60 * 1000;
  const now = Date.parse("2026-08-20T01:00:00.000Z");

  it("does not fail queued pending while another chapter was updated recently", () => {
    expect(
      shouldFailStalePendingItems(
        [
          {
            status: "ok",
            updatedAt: "2026-08-20T00:59:00.000Z",
          },
          {
            status: "pending",
            updatedAt: "2026-08-20T00:30:00.000Z",
          },
        ],
        now,
        staleMs,
      ),
    ).toBe(false);
  });

  it("fails remaining pending only after the whole run is idle", () => {
    expect(
      shouldFailStalePendingItems(
        [
          {
            status: "ok",
            updatedAt: "2026-08-20T00:30:00.000Z",
          },
          {
            status: "pending",
            updatedAt: "2026-08-20T00:30:00.000Z",
          },
        ],
        now,
        staleMs,
      ),
    ).toBe(true);
  });

  it("does nothing when every chapter is settled", () => {
    expect(
      shouldFailStalePendingItems(
        [{ status: "ok", updatedAt: "2026-08-20T00:30:00.000Z" }],
        now,
        staleMs,
      ),
    ).toBe(false);
  });
});

describe("withChapterGenerateGate", () => {
  it(`never runs more than ${CHAPTER_GENERATE_CONCURRENCY} jobs at once`, async () => {
    let current = 0;
    let max = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        withChapterGenerateGate(async () => {
          current += 1;
          max = Math.max(max, current);
          await new Promise((r) => setTimeout(r, 25));
          current -= 1;
        }),
      ),
    );
    expect(max).toBe(CHAPTER_GENERATE_CONCURRENCY);
  });
});

describe("startDraftRunProcessor", () => {
  it("reuses the in-flight processor for the same run", async () => {
    let started = 0;
    const first = startDraftRunProcessor("run-a", async () => {
      started += 1;
      await new Promise((r) => setTimeout(r, 40));
    });
    const second = startDraftRunProcessor("run-a", async () => {
      started += 1;
    });
    expect(second).toBe(first);
    await first;
    expect(started).toBe(1);
  });
});
