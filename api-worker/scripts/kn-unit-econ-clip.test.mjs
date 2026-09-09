import assert from "node:assert/strict";
import { renderUnitEconLead } from "../src/kn-md-specials.ts";

const html = renderUnitEconLead(`# 商业模式

**获客成本:** 签约一名艺人的总成本（含法务、建模、训练与首年运营）
**终身价值:** 单名艺人在合同期内的总授权收入
**定价:** 有行业参考 (Metaphysic、Synthesia)，需按片酬分成校准
`);

assert.match(html, /训练与首年运营/);
assert.match(html, /Synthesia/);
assert.doesNotMatch(html, /建模…/);
assert.doesNotMatch(html, /Metaphysic、…/);

const short = renderUnitEconLead(`# 商业模式

**获客成本:** 800 元
**LTV:** 4800 元
`);
assert.match(short, /800 元/);
assert.match(short, /4800 元/);

console.log("kn-unit-econ-clip: ok");
