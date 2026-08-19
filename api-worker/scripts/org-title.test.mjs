import assert from "node:assert/strict";
import { stripOrgRoleLabel } from "../src/org-title.ts";

assert.equal(stripOrgRoleLabel("研究部 · Basic 基础级"), "研究部");
assert.equal(stripOrgRoleLabel("家族办公室 · Core 核心级"), "家族办公室");
assert.equal(stripOrgRoleLabel("合域 · Admin"), "合域");
assert.equal(stripOrgRoleLabel("投资顾问 · Advanced 进阶级"), "投资顾问");
assert.equal(stripOrgRoleLabel("访客 · Guest"), "访客");
assert.equal(stripOrgRoleLabel("访客 · 多肽项目"), "访客 · 多肽项目");
assert.equal(stripOrgRoleLabel("合域"), "合域");

console.log("org-title: ok");
