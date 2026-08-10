/**
 * /v1/skills* 路由（mysql-local-bridge 与 skills-bridge 共用）
 */
import fs from "node:fs";
import {
  createSkill,
  deleteSkill,
  isVolumeMode,
  listSkills,
  readSkillMarkdown,
  readSkillTree,
  resolveSkillsPaths,
  syncSkills,
  writeSkillMarkdown,
  writeSkillTree,
} from "./skills-fs.mjs";

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function requireBridgeAuth(req, bridgeKey, res) {
  if (!bridgeKey) return true;
  const auth = req.headers.authorization ?? "";
  if (auth === `Bearer ${bridgeKey}`) return true;
  json(res, 401, { error: "unauthorized" });
  return false;
}

/**
 * @returns {Promise<boolean>} 是否已处理该请求
 */
export async function tryHandleSkillsRoutes(req, res, url, { pick, bridgeKey }) {
  if (req.method === "GET" && url.pathname === "/v1/skills") {
    if (!requireBridgeAuth(req, bridgeKey, res)) return true;
    try {
      json(res, 200, { ok: true, ...listSkills(pick) });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message ?? e) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/v1/skills/sync") {
    if (!requireBridgeAuth(req, bridgeKey, res)) return true;
    try {
      json(res, 200, syncSkills(pick));
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message ?? e) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/v1/skills") {
    if (!requireBridgeAuth(req, bridgeKey, res)) return true;
    try {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: "invalid json" });
        return true;
      }
      const name = typeof body.name === "string" ? body.name : "";
      json(
        res,
        201,
        createSkill(pick, name, {
          title: typeof body.title === "string" ? body.title : undefined,
          content: typeof body.content === "string" ? body.content : undefined,
          mirrorInstalled: body.mirrorInstalled !== false,
        }),
      );
    } catch (e) {
      const status = e?.status === 409 ? 409 : 400;
      json(res, status, { ok: false, error: String(e?.message ?? e) });
    }
    return true;
  }

  const skillTree = /^\/v1\/skills\/([^/]+)\/tree$/u.exec(url.pathname);
  if (skillTree) {
    if (!requireBridgeAuth(req, bridgeKey, res)) return true;
    const skillName = decodeURIComponent(skillTree[1]);
    try {
      if (req.method === "GET") {
        json(res, 200, readSkillTree(pick, skillName));
        return true;
      }
      if (req.method === "PUT") {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          json(res, 400, { error: "invalid json" });
          return true;
        }
        const files = Array.isArray(body.files) ? body.files : null;
        if (!files) {
          json(res, 400, { error: "缺少 files 数组" });
          return true;
        }
        json(res, 200, writeSkillTree(pick, skillName, files));
        return true;
      }
    } catch (e) {
      const status =
        e?.status === 404 ? 404 : e?.status === 409 ? 409 : 400;
      json(res, status, { ok: false, error: String(e?.message ?? e) });
      return true;
    }
    return false;
  }

  const skillOne = /^\/v1\/skills\/([^/]+)$/u.exec(url.pathname);
  if (!skillOne) return false;

  if (!requireBridgeAuth(req, bridgeKey, res)) return true;
  const skillName = decodeURIComponent(skillOne[1]);
  try {
    if (req.method === "GET") {
      json(res, 200, readSkillMarkdown(pick, skillName));
      return true;
    }
    if (req.method === "PUT") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        json(res, 400, { error: "invalid json" });
        return true;
      }
      const content = typeof body.content === "string" ? body.content : null;
      if (content === null) {
        json(res, 400, { error: "缺少 content 字符串" });
        return true;
      }
      json(
        res,
        200,
        writeSkillMarkdown(pick, skillName, content, {
          mirrorInstalled: body.mirrorInstalled !== false,
        }),
      );
      return true;
    }
    if (req.method === "DELETE") {
      let body = {};
      try {
        const raw = await readBody(req);
        if (raw.trim()) body = JSON.parse(raw);
      } catch {
        /* 无 body 亦可 */
      }
      json(
        res,
        200,
        deleteSkill(pick, skillName, {
          removeInstalled: body.removeInstalled !== false,
        }),
      );
      return true;
    }
  } catch (e) {
    const status =
      e?.status === 404 ? 404 : e?.status === 409 ? 409 : 500;
    json(res, status, { ok: false, error: String(e?.message ?? e) });
    return true;
  }

  return false;
}

export function skillsHealthPayload(pick) {
  const paths = resolveSkillsPaths(pick);
  const volumeMode = isVolumeMode(pick);
  const sourceExists =
    fs.existsSync(paths.source) && fs.statSync(paths.source).isDirectory();
  let skillsCount = 0;
  if (sourceExists) {
    try {
      skillsCount = listSkills(pick).skills.length;
    } catch {
      skillsCount = 0;
    }
  }
  return {
    ok: true,
    service: "skills-bridge",
    sourceDir: paths.source,
    installedDir: paths.installed,
    volumeMode,
    sourceExists,
    installedExists:
      fs.existsSync(paths.installed) &&
      fs.statSync(paths.installed).isDirectory(),
    skillsCount,
  };
}
