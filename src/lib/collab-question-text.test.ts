import assert from "node:assert/strict";
import {
  collabQuestionLines,
  formatCollabLineBreaks,
  joinCollabQuestionLines,
} from "./collab-question-text.ts";

const flat =
  "1. 甲公司是否为原公司？ 2. 是否可以提供架构图？ 3. 成果如何转入？";
assert.equal(
  formatCollabLineBreaks(flat),
  "1. 甲公司是否为原公司？\n2. 是否可以提供架构图？\n3. 成果如何转入？",
);

const lines = collabQuestionLines(flat);
const joined = joinCollabQuestionLines([lines[2]!, lines[0]!, lines[1]!]);
assert.equal(
  joined,
  "1. 成果如何转入？\n2. 甲公司是否为原公司？\n3. 是否可以提供架构图？",
);

assert.equal(formatCollabLineBreaks("第一段\n第二段"), "第一段\n第二段");
assert.equal(
  joinCollabQuestionLines(["先说结论", "再补材料"]),
  "先说结论\n再补材料",
);

console.log("collab-question-text ok");
