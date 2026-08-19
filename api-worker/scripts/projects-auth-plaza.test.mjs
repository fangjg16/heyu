import assert from "node:assert/strict";
import { membershipsAllowPlazaDiscovery } from "../src/plaza-discovery.ts";

assert.equal(membershipsAllowPlazaDiscovery([]), true);
assert.equal(membershipsAllowPlazaDiscovery(["issuer"]), true);

console.log("projects-auth-plaza: ok");
