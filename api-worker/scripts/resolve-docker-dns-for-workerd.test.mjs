import {
  applyResolvedHostname,
  isDockerServiceHostname,
  resolveUrlEnvForWorkerd,
} from "./resolve-docker-dns-for-workerd.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isDockerServiceHostname("hermes") === true, "hermes");
assert(isDockerServiceHostname("mysql-bridge") === true, "mysql-bridge");
assert(isDockerServiceHostname("minio") === true, "minio");
assert(isDockerServiceHostname("localhost") === false, "localhost");
assert(isDockerServiceHostname("127.0.0.1") === false, "loopback");
assert(isDockerServiceHostname("172.18.0.5") === false, "ipv4");
assert(
  isDockerServiceHostname("hermes-agent.up.railway.app") === false,
  "public host",
);

assert(
  applyResolvedHostname("http://hermes:8642", "172.18.0.9") ===
    "http://172.18.0.9:8642",
  "origin url",
);
assert(
  applyResolvedHostname("http://hermes:8642/", "172.18.0.9") ===
    "http://172.18.0.9:8642/",
  "trailing slash",
);
assert(
  applyResolvedHostname("http://hermes:8642/v1/runs", "10.0.0.2") ===
    "http://10.0.0.2:8642/v1/runs",
  "path",
);

const lookup = async () => ({ address: "172.30.0.13" });
const env = {
  HERMES_BASE_URL: "http://hermes:8642",
  MYSQL_BRIDGE_URL: "http://mysql-bridge:8790",
  MINIO_ENDPOINT: "http://minio:9000",
  DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};
const changes = await resolveUrlEnvForWorkerd(env, lookup);
assert(env.HERMES_BASE_URL === "http://hermes:8642", "hermes stays hostname for Node proxy");
assert(env.MYSQL_BRIDGE_URL === "http://172.30.0.13:8790", "rewrite bridge");
assert(env.MINIO_ENDPOINT === "http://172.30.0.13:9000", "rewrite minio");
assert(changes.length === 2, `changes ${changes.length}`);

const publicEnv = {
  HERMES_BASE_URL: "https://hermes-agent.up.railway.app",
};
await resolveUrlEnvForWorkerd(publicEnv, lookup);
assert(
  publicEnv.HERMES_BASE_URL === "https://hermes-agent.up.railway.app",
  "leave public url",
);

console.log("resolve-docker-dns-for-workerd: ok");
