import { describe, expect, it } from "vitest";
import { applyDownloadRangeHeaders } from "./documents-download";

describe("applyDownloadRangeHeaders", () => {
  it("advertises byte ranges so pdf.js can fetch the first page first", () => {
    const headers = new Headers();
    applyDownloadRangeHeaders(headers, {
      size: 65536,
      contentRange: "bytes 0-65535/5900000",
    });
    expect(headers.get("Accept-Ranges")).toBe("bytes");
    expect(headers.get("Content-Length")).toBe("65536");
    expect(headers.get("Content-Range")).toBe("bytes 0-65535/5900000");
  });

  it("still sets Accept-Ranges on a full-file response", () => {
    const headers = new Headers();
    applyDownloadRangeHeaders(headers, { size: 5900000 });
    expect(headers.get("Accept-Ranges")).toBe("bytes");
    expect(headers.get("Content-Length")).toBe("5900000");
    expect(headers.get("Content-Range")).toBeNull();
  });
});
