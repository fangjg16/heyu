import { describe, expect, it } from "vitest";
import { coerceAccountStatus, isAccountDisabled } from "./account-status";

describe("coerceAccountStatus", () => {
  it("keeps active aliases", () => {
    expect(coerceAccountStatus("active")).toBe("active");
    expect(coerceAccountStatus("ACTIVE")).toBe("active");
    expect(coerceAccountStatus(" enabled ")).toBe("active");
  });

  it("treats any non-active value as disabled, including dirty DB payloads", () => {
    expect(coerceAccountStatus("disabled")).toBe("disabled");
    expect(coerceAccountStatus("Disabled")).toBe("disabled");
    expect(coerceAccountStatus("inactive")).toBe("disabled");
    expect(coerceAccountStatus("停用")).toBe("disabled");
    expect(coerceAccountStatus({ type: "Buffer", data: [100, 105, 115, 97, 98, 108, 101, 100] })).toBe(
      "disabled",
    );
  });

  it("empty or missing stays active so new rows are not locked out", () => {
    expect(coerceAccountStatus(null)).toBe("active");
    expect(coerceAccountStatus("")).toBe("active");
    expect(isAccountDisabled(undefined)).toBe(false);
  });
});
