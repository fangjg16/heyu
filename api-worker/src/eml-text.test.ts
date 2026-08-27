import { describe, expect, it } from "vitest";
import { extractEmlPlainText } from "./eml-text";

function encodeEml(s: string): Uint8Array {
  return new TextEncoder().encode(s.replace(/\n/gu, "\r\n"));
}

describe("extractEmlPlainText", () => {
  it("reads a simple text/plain message", async () => {
    const raw = encodeEml(`From: a@example.com
To: b@example.com
Subject: =?UTF-8?B?${Buffer.from("小步道", "utf8").toString("base64")}?=
Content-Type: text/plain; charset=utf-8

正文第一行
第二行
`);
    const r = await extractEmlPlainText(raw, "note.eml");
    expect(r.parsed).toBe(true);
    expect(r.text).toContain("主题：小步道");
    expect(r.text).toContain("正文第一行");
    expect(r.attachments).toHaveLength(0);
  });

  it("prefers text/plain over html in multipart/alternative", async () => {
    const raw = encodeEml(`From: a@example.com
Subject: mix
Content-Type: multipart/alternative; boundary="AAA"

--AAA
Content-Type: text/plain; charset=utf-8

PLAIN-BODY

--AAA
Content-Type: text/html; charset=utf-8

<html><body><p>HTML-BODY</p></body></html>
--AAA--
`);
    const r = await extractEmlPlainText(raw, "mix.eml");
    expect(r.text).toContain("PLAIN-BODY");
    expect(r.text).not.toContain("HTML-BODY");
  });

  it("extracts a base64 attachment and lists it", async () => {
    const payload = Buffer.from("hello-attach").toString("base64");
    const raw = encodeEml(`From: a@example.com
Subject: with-file
Content-Type: multipart/mixed; boundary="BBB"

--BBB
Content-Type: text/plain; charset=utf-8

MAIL-BODY

--BBB
Content-Type: application/pdf; name="term.pdf"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="term.pdf"

${payload}
--BBB--
`);
    const r = await extractEmlPlainText(raw, "with.eml");
    expect(r.text).toContain("MAIL-BODY");
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0]?.fileName).toBe("term.pdf");
    expect(new TextDecoder().decode(r.attachments[0]!.bytes)).toBe("hello-attach");
    expect(r.text).toContain("term.pdf");
  });
});
