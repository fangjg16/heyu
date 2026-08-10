/**
 * 给 chapters 下所有 MD 的 <th style="…"> 补上 white-space:nowrap
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const chaptersRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/knowledge-network/chapters",
);

function patch(content) {
  return content.replace(/<th(\s[^>]*?)?>/giu, (full, attrs = "") => {
    const a = attrs ?? "";
    if (/white-space\s*:\s*nowrap/iu.test(a)) return full;
    if (/style\s*=\s*"/iu.test(a)) {
      return `<th${a.replace(/style\s*=\s*"/iu, 'style="white-space:nowrap;')}>`;
    }
    return `<th style="white-space:nowrap"${a}>`;
  });
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".md")) {
      const before = fs.readFileSync(p, "utf8");
      const after = patch(before);
      if (after !== before) {
        fs.writeFileSync(p, after, "utf8");
        console.log("patched", path.relative(chaptersRoot, p));
      }
    }
  }
}

walk(chaptersRoot);
console.log("done");
