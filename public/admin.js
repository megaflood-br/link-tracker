const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const editor = document.getElementById("editor");
const editorForm = document.getElementById("editor-form");
const detail = document.getElementById("detail");

let publicUrl = "";
let editingId = null;

function showError(el, message) {
  el.hidden = !message;
  el.textContent = message || "";
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function dayLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00`));
}

function deviceLabel(device) {
  return { mobile: "celular", desktop: "computador", tablet: "tablet" }[device] || device;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401 && path !== "/api/me" && path !== "/api/login") {
    renderAuth(false);
    throw new Error("Não autenticado");
  }
  const isJson = (res.headers.get("content-type") || "").includes("json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || "Falha na requisição");
  return data;
}

function renderAuth(ok) {
  loginView.hidden = ok;
  appView.hidden = !ok;
}

function updateSlugPreview() {
  const slug = document.getElementById("field-slug").value.trim().toLowerCase();
  document.getElementById("slug-preview").textContent = slug
    ? `${publicUrl}/${slug}`
    : publicUrl + "/…";
}

function openEditor(link) {
  editingId = link?.id || null;
  document.getElementById("editor-kicker").textContent = link ? "Editar link" : "Novo link";
  document.getElementById("editor-title").textContent = link
    ? "Atualize o destino ou o nome"
    : "Para onde este atalho leva?";
  document.getElementById("field-title").value = link?.title || "";
  document.getElementById("field-slug").value = link?.slug || "";
  document.getElementById("field-url").value = link?.url || "";
  document.getElementById("field-active").checked = link ? link.active : true;
  showError(document.getElementById("editor-error"), "");
  updateSlugPreview();
  editor.showModal();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Copie o link:", text);
  }
}

function renderStats(stats) {
  document.getElementById("stats-cards").innerHTML = `
    <article class="stat"><span>Total de acessos</span><b>${stats.total}</b></article>
    <article class="stat"><span>Hoje</span><b>${stats.today}</b></article>
    <article class="stat"><span>Últimos 14 dias</span><b>${stats.last14}</b></article>
  `;

  const max = Math.max(1, ...stats.series.map((p) => p.count));
  const today = stats.series.at(-1)?.date;
  document.getElementById("chart").innerHTML = stats.series
    .map((point) => {
      const h = Math.round((point.count / max) * 100);
      return `<div class="bar ${point.date === today ? "is-today" : ""}" title="${dayLabel(point.date)}: ${point.count}" style="height:${h}%"></div>`;
    })
    .join("");

  const { mobile, desktop, tablet } = stats.devices;
  document.getElementById("device-line").textContent =
    `${mobile} no celular · ${desktop} no computador · ${tablet} no tablet`;

  const recent = document.getElementById("recent");
  if (!stats.recent.length) {
    recent.innerHTML = `<p class="muted">Os cliques aparecem aqui em tempo quase real.</p>`;
    return;
  }
  recent.innerHTML = stats.recent
    .map(
      (row) => `
      <article>
        <strong>${row.title}</strong>
        <small>${fmtDate(row.at)} · ${deviceLabel(row.device)} · /${row.slug}</small>
      </article>`,
    )
    .join("");
}

function renderLinks(links) {
  const empty = document.getElementById("links-empty");
  const list = document.getElementById("links-list");
  empty.hidden = links.length > 0;
  list.innerHTML = links
    .map(
      (link) => `
      <article class="card">
        <div class="card-top">
          <div>
            <div class="slug">/${link.slug}</div>
            <strong>${link.title}</strong>
          </div>
          <small>${link.clicks} acesso${link.clicks === 1 ? "" : "s"}</small>
        </div>
        <small>${link.active ? "Ativo" : "Pausado"} · último clique ${fmtDate(link.lastClick)}</small>
        <div class="card-actions">
          <button type="button" data-copy="${link.shortUrl}">Copiar</button>
          <button type="button" data-edit="${link.id}">Editar</button>
          <button type="button" data-detail="${link.id}">Detalhes</button>
          <a href="${link.shortUrl}" target="_blank" rel="noreferrer">Testar</a>
        </div>
      </article>`,
    )
    .join("");

  list.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.copy));
  });
  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const link = links.find((item) => String(item.id) === btn.dataset.edit);
      openEditor(link);
    });
  });
  list.querySelectorAll("[data-detail]").forEach((btn) => {
    btn.addEventListener("click", () => openDetail(btn.dataset.detail));
  });
}

async function openDetail(id) {
  const data = await api(`/api/stats/${id}`);
  document.getElementById("detail-slug").textContent = `/${data.link.slug}`;
  document.getElementById("detail-title").textContent = data.link.title;
  document.getElementById("detail-url").textContent = data.link.shortUrl;
  document.getElementById("detail-qr").href =
    `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(data.link.shortUrl)}`;
  document.getElementById("detail-csv").href = `/api/export/${id}.csv`;
  const box = document.getElementById("detail-clicks");
  box.innerHTML = data.clicks.length
    ? data.clicks
        .map(
          (row) => `
        <article>
          <strong>${fmtDate(row.at)}</strong>
          <small>${deviceLabel(row.device)}${row.referrer ? ` · ${row.referrer}` : ""}</small>
        </article>`,
        )
        .join("")
    : `<p class="muted">Ainda não houve acessos neste link.</p>`;
  detail.showModal();
}

async function loadDashboard() {
  const [links, stats] = await Promise.all([api("/api/links"), api("/api/stats")]);
  renderLinks(links);
  renderStats(stats);
}

async function boot() {
  const me = await api("/api/me");
  publicUrl = me.publicUrl;
  renderAuth(me.ok);
  document.getElementById("password-banner").hidden = !me.ok || !me.mustChangePassword;
  if (me.ok) await loadDashboard();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(loginError, "");
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: document.getElementById("password").value }),
    });
    await boot();
  } catch (err) {
    showError(loginError, err.message);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  renderAuth(false);
});

document.getElementById("new-link-btn").addEventListener("click", () => openEditor(null));
document.getElementById("cancel-edit").addEventListener("click", () => editor.close());
document.getElementById("close-detail").addEventListener("click", () => detail.close());
document.getElementById("field-slug").addEventListener("input", updateSlugPreview);

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: document.getElementById("field-title").value,
    slug: document.getElementById("field-slug").value,
    url: document.getElementById("field-url").value,
    active: document.getElementById("field-active").checked,
  };
  try {
    await api(editingId ? `/api/links/${editingId}` : "/api/links", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    editor.close();
    await loadDashboard();
  } catch (err) {
    showError(document.getElementById("editor-error"), err.message);
  }
});

boot();
