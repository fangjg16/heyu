import assert from "node:assert/strict";
import { membershipsAllowPlazaDiscovery } from "../src/plaza-discovery.ts";

assert.equal(membershipsAllowPlazaDiscovery([]), true);
assert.equal(membershipsAllowPlazaDiscovery(["admin"]), true);
assert.equal(membershipsAllowPlazaDiscovery(["issuer", "core"]), true);
assert.equal(membershipsAllowPlazaDiscovery(["issuer"]), false);
assert.equal(membershipsAllowPlazaDiscovery(["issuer", "guest"]), false);
assert.equal(membershipsAllowPlazaDiscovery(["issuer"], "low"), true);
assert.equal(membershipsAllowPlazaDiscovery(["issuer"], "core"), true);
assert.equal(membershipsAllowPlazaDiscovery([], "issuer"), false);
assert.equal(membershipsAllowPlazaDiscovery(["core"], "issuer"), false);

console.log("projects-auth-plaza: ok");
