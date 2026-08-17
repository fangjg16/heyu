import { describe, expect, it } from "vitest";
import { stripCitationMarkers } from "./kn-citation-markers";

describe("stripCitationMarkers", () => {
  it("strips trailing [A-1]", () => {
    expect(stripCitationMarkers("请确认实控人 [A-1]")).toBe("请确认实控人");
  });

  it("strips consecutive [A-100][S-100]", () => {
    expect(
      stripCitationMarkers("请补充最近一期审计报告原件。[A-100][S-100]"),
    ).toBe("请补充最近一期审计报告原件。");
  });

  it("strips spaced clusters and optional inner spaces", () => {
    expect(stripCitationMarkers("请确认估值依据 [A-100] [S-100]")).toBe(
      "请确认估值依据",
    );
    expect(stripCitationMarkers("请确认估值依据 [ A-10b ]")).toBe(
      "请确认估值依据",
    );
  });

  it("keeps the sentence when there is no marker", () => {
    expect(stripCitationMarkers("请确认实控人是否为张三")).toBe(
      "请确认实控人是否为张三",
    );
  });
});
