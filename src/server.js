import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import { initDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const db = initDb(path.join(rootDir, "data", "links.db"));

const PORT = Number(process.env.PORT || 3847);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "altere-esta-senha";
const BASE_PATH = String(process.env.BASE_PATH || "")
  .trim()
  .replace(/\/+$/, "");
const BASE = BASE_PATH ? (BASE_PATH.startsWith("/") ? BASE_PATH : `/${BASE_PATH}`) : "";
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}${BASE}`).replace(
  /\/$/,
  "",
);
const RESERVED = new Set([
  "admin",
  "api",
  "login",
  "logout",
  "assets",
  "favicon.ico",
  "robots.txt",
  "link-tracker",
]);

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(
  session({
    name: "lt.sid",
    secret: process.env.SESSION_SECRET || "dev-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

const loginAttempts = new Map();

function clientIp(req) {
  const raw = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "");
  const ip = raw.split(",")[0].trim();
  return anonymizeIp(ip);
}

function anonymizeIp(ip) {
  if (!ip) return "";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + "::";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return ip;
}

function parseDevice(ua = "") {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.+mobile|windows phone/.test(s)) return "mobile";
  return "desktop";
}

function todayKeySP(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayKeys(days) {
  const keys = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(todayKeySP(d));
  }
  return keys;
}

const tokens = new Map();

function readToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] || "";
}

function isAuthed(req) {
  if (req.session?.ok) return true;
  const token = readToken(req);
  const expires = tokens.get(token);
  return Boolean(token && expires && expires > Date.now());
}

function issueToken() {
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + 7 * 24 * 60 * 60 * 1000);
  return token;
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "Não autenticado" });
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-_]{0,47}$/.test(slug) && !RESERVED.has(slug);
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function linkRow(row) {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    url: row.url,
    active: Boolean(row.active),
    createdAt: row.created_at,
    shortUrl: `${PUBLIC_URL}/${row.slug}`,
  };
}

function tooManyLogins(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { n: 0, t: now };
  if (now - rec.t > 15 * 60 * 1000) {
    loginAttempts.set(ip, { n: 1, t: now });
    return false;
  }
  rec.n += 1;
  loginAttempts.set(ip, rec);
  return rec.n > 40;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

const routes = express.Router();

routes.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

routes.get("/api/me", (req, res) => {
  res.json({
    ok: isAuthed(req),
    publicUrl: PUBLIC_URL,
    basePath: BASE,
    mustChangePassword: ADMIN_PASSWORD === "altere-esta-senha",
  });
});

routes.post("/api/login", (req, res) => {
  const ip = clientIp(req) || "unknown";
  if (tooManyLogins(ip)) {
    return res.status(429).json({ error: "Muitas tentativas. Reinicie o serviço ou aguarde alguns minutos." });
  }
  const password = String(req.body?.password || "");
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Senha incorreta." });
  }
  loginAttempts.delete(ip);
  req.session.ok = true;
  res.json({ ok: true, token: issueToken() });
});

routes.post("/api/logout", (req, res) => {
  const token = readToken(req);
  if (token) tokens.delete(token);
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

routes.get("/api/links", requireAuth, (_req, res) => {
  const links = db.prepare("SELECT * FROM links ORDER BY created_at DESC").all().map(linkRow);
  const counts = db
    .prepare("SELECT link_id, COUNT(*) AS total FROM clicks GROUP BY link_id")
    .all();
  const last = db
    .prepare(
      `SELECT link_id, MAX(clicked_at) AS last_at
       FROM clicks GROUP BY link_id`,
    )
    .all();
  const countMap = Object.fromEntries(counts.map((r) => [Number(r.link_id), Number(r.total)]));
  const lastMap = Object.fromEntries(last.map((r) => [Number(r.link_id), r.last_at]));
  res.json(
    links.map((link) => ({
      ...link,
      clicks: countMap[link.id] || 0,
      lastClick: lastMap[link.id] || null,
    })),
  );
});

routes.post("/api/links", requireAuth, (req, res) => {
  const slug = normalizeSlug(req.body?.slug);
  const title = String(req.body?.title || "").trim();
  const url = String(req.body?.url || "").trim();
  const active = req.body?.active === false ? 0 : 1;

  if (!title) return res.status(400).json({ error: "Informe um título." });
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Slug inválido. Use letras, números e hífen." });
  }
  if (!isValidUrl(url)) return res.status(400).json({ error: "URL de destino inválida." });

  try {
    const info = db
      .prepare(
        "INSERT INTO links (slug, title, url, active, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(slug, title, url, active, new Date().toISOString());
    const row = db.prepare("SELECT * FROM links WHERE id = ?").get(Number(info.lastInsertRowid));
    res.status(201).json(linkRow(row));
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Esse slug já existe." });
    }
    throw err;
  }
});

routes.put("/api/links/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM links WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Link não encontrado." });

  const slug = normalizeSlug(req.body?.slug ?? current.slug);
  const title = String(req.body?.title ?? current.title).trim();
  const url = String(req.body?.url ?? current.url).trim();
  const active = req.body?.active === false ? 0 : 1;

  if (!title) return res.status(400).json({ error: "Informe um título." });
  if (!isValidSlug(slug)) {
    return res.status(400).json({ error: "Slug inválido. Use letras, números e hífen." });
  }
  if (!isValidUrl(url)) return res.status(400).json({ error: "URL de destino inválida." });

  try {
    db.prepare("UPDATE links SET slug = ?, title = ?, url = ?, active = ? WHERE id = ?").run(
      slug,
      title,
      url,
      active,
      id,
    );
    res.json(linkRow(db.prepare("SELECT * FROM links WHERE id = ?").get(id)));
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Esse slug já existe." });
    }
    throw err;
  }
});

routes.delete("/api/links/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM clicks WHERE link_id = ?").run(id);
  const info = db.prepare("DELETE FROM links WHERE id = ?").run(id);
  if (!info.changes) return res.status(404).json({ error: "Link não encontrado." });
  res.json({ ok: true });
});

routes.get("/api/stats", requireAuth, (_req, res) => {
  const keys = dayKeys(14);
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const rows = db
    .prepare("SELECT clicked_at, device FROM clicks WHERE clicked_at >= ?")
    .all(since.toISOString());

  const byDay = Object.fromEntries(keys.map((k) => [k, 0]));
  const devices = { mobile: 0, desktop: 0, tablet: 0 };
  for (const row of rows) {
    const key = todayKeySP(new Date(row.clicked_at));
    if (key in byDay) byDay[key] += 1;
    const device = row.device || "desktop";
    if (device in devices) devices[device] += 1;
  }

  const today = todayKeySP();
  const total = Number(db.prepare("SELECT COUNT(*) AS n FROM clicks").get().n);
  const todayCount = rows.filter((r) => todayKeySP(new Date(r.clicked_at)) === today).length;
  const recent = db
    .prepare(
      `SELECT c.clicked_at, c.device, c.referrer, l.slug, l.title
       FROM clicks c JOIN links l ON l.id = c.link_id
       ORDER BY c.clicked_at DESC LIMIT 20`,
    )
    .all()
    .map((r) => ({
      at: r.clicked_at,
      device: r.device,
      referrer: r.referrer,
      slug: r.slug,
      title: r.title,
    }));

  res.json({
    total,
    today: todayCount,
    last14: rows.length,
    series: keys.map((date) => ({ date, count: byDay[date] })),
    devices,
    recent,
  });
});

routes.get("/api/stats/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const link = db.prepare("SELECT * FROM links WHERE id = ?").get(id);
  if (!link) return res.status(404).json({ error: "Link não encontrado." });
  const clicks = db
    .prepare(
      `SELECT clicked_at, device, referrer, ip
       FROM clicks WHERE link_id = ? ORDER BY clicked_at DESC LIMIT 200`,
    )
    .all(id)
    .map((r) => ({
      at: r.clicked_at,
      device: r.device,
      referrer: r.referrer,
      ip: r.ip,
    }));
  res.json({ link: linkRow(link), clicks, total: clicks.length });
});

routes.get("/api/export/:id.csv", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const link = db.prepare("SELECT * FROM links WHERE id = ?").get(id);
  if (!link) return res.status(404).send("not found");
  const rows = db
    .prepare(
      "SELECT clicked_at, device, referrer, ip, user_agent FROM clicks WHERE link_id = ? ORDER BY clicked_at DESC",
    )
    .all(id);
  const header = "clicked_at,device,referrer,ip,user_agent";
  const body = rows
    .map((r) =>
      [r.clicked_at, r.device, r.referrer, r.ip, r.user_agent]
        .map((v) => `"${String(v || "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${link.slug}-acessos.csv"`);
  res.send(`${header}\n${body}\n`);
});

routes.get("/", (req, res) => {
  res.redirect(`${req.baseUrl || ""}/admin`);
});

function renderAdminPage() {
  const html = fs.readFileSync(path.join(publicDir, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(publicDir, "admin.css"), "utf8");
  const js = fs.readFileSync(path.join(publicDir, "admin.js"), "utf8");
  return html
    .replace('<link rel="icon" href="favicon.svg" type="image/svg+xml" />', "")
    .replace('<link rel="stylesheet" href="admin.css" />', `<style>${css}</style>`)
    .replace('<script src="admin.js"></script>', `<script>${js}</script>`);
}

routes.get(["/admin", "/admin/"], (_req, res) => {
  res.type("html").send(renderAdminPage());
});

routes.use(express.static(publicDir, { index: false }));

routes.get("/:slug", (req, res, next) => {
  const slug = normalizeSlug(req.params.slug);
  if (!isValidSlug(slug)) return next();

  const link = db.prepare("SELECT * FROM links WHERE slug = ? AND active = 1").get(slug);
  if (!link) {
    res.status(404).sendFile(path.join(publicDir, "404.html"));
    return;
  }

  db.prepare(
    `INSERT INTO clicks (link_id, clicked_at, ip, user_agent, referrer, device)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    link.id,
    new Date().toISOString(),
    clientIp(req),
    String(req.headers["user-agent"] || "").slice(0, 400),
    String(req.headers.referer || "").slice(0, 400),
    parseDevice(String(req.headers["user-agent"] || "")),
  );

  res.redirect(302, link.url);
});

app.use("/", routes);
app.use("/link-tracker", routes);
if (BASE && BASE !== "/link-tracker") {
  app.use(BASE, routes);
}

app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, "404.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.status === 400) {
    return res.status(400).json({ error: "Dados inválidos." });
  }
  res.status(500).json({ error: "Erro interno." });
});

app.listen(PORT, () => {
  console.log(`Link Tracker em ${PUBLIC_URL}`);
  console.log(`Painel: ${PUBLIC_URL}/admin`);
});
