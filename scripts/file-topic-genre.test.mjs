import assert from "node:assert/strict";
import {
  canonicalizeFileTopic,
  inferDocumentGenre,
} from "../src/lib/file-topic.ts";
import { inferDocumentGenre as inferApi } from "../api-worker/src/file-topic.ts";

const news =
  "独家 | 清华北大普林斯顿天才少年, 用 “空间Agent” 重构AI健康硬件, 高瓴、智元投了.pdf";

assert.equal(
  inferDocumentGenre({ filename: news, documentType: "项目介绍" }),
  "融资新闻稿",
);
assert.equal(inferApi({ filename: news, documentType: "项目介绍" }), "融资新闻稿");
assert.equal(canonicalizeFileTopic("融资新闻稿", news), "项目介绍");
assert.equal(
  inferDocumentGenre({
    filename: "02_大陆地块测绘图_SP265790.pdf",
    documentType: "尽调材料",
  }),
  "测绘图",
);

console.log("file-topic-genre: ok");
