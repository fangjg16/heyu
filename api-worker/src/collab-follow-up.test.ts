import { describe, expect, it } from "vitest";
import { parseCollabFollowUpSuggest } from "./collab-follow-up";

describe("parseCollabFollowUpSuggest", () => {
  it("parses fenced json", () => {
    const got = parseCollabFollowUpSuggest(`
\`\`\`json
{"complete":false,"completeness":"未给测算依据","shouldFollowUp":true,"followUpAdvice":"建议补衰减曲线","title":"衰减曲线测算依据","body":"请补充工况与 DoD 设定下的测算。"}
\`\`\`
`);
    expect(got).toEqual({
      complete: false,
      completeness: "未给测算依据",
      shouldFollowUp: true,
      followUpAdvice: "建议补衰减曲线",
      title: "衰减曲线测算依据",
      body: "请补充工况与 DoD 设定下的测算。",
    });
  });

  it("accepts chinese yes/no", () => {
    const got = parseCollabFollowUpSuggest(
      `{"complete":"完整","completeness":"要点已覆盖","shouldFollowUp":"否","followUpAdvice":"可不补充","title":"","body":""}`,
    );
    expect(got?.complete).toBe(true);
    expect(got?.shouldFollowUp).toBe(false);
  });
});
