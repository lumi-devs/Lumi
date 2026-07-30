import { FieldType, type ConfigField } from "@lumi/contracts";
import { guildIconUrl } from "./discord.js";
import type { DashboardData, OAuthGuild, Session } from "./types.js";
import { config } from "./config.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap');

:root {
  --bg: #090a0f;
  --panel: #11131c;
  --panel-2: #161925;
  --border: rgba(255, 255, 255, 0.08);
  --border-focus: rgba(88, 101, 242, 0.4);
  --text: #f1f3f7;
  --muted: #80869a;
  --accent: #5865f2;
  --accent-hover: #4752c4;
  --accent-glow: rgba(88, 101, 242, 0.15);
  --ok: #248046;
  --ok-glow: rgba(36, 128, 70, 0.2);
  --danger: #da373c;
  --danger-glow: rgba(218, 55, 60, 0.2);
  --max-width: 1100px;
}

@media(prefers-color-scheme: light) {
  :root {
    --bg: #f6f8fa;
    --panel: #ffffff;
    --panel-2: #f0f2f5;
    --border: rgba(0, 0, 0, 0.08);
    --border-focus: rgba(88, 101, 242, 0.4);
    --text: #1a1b22;
    --muted: #626778;
    --accent-glow: rgba(88, 101, 242, 0.08);
    --ok: #2da44e;
    --ok-glow: rgba(45, 164, 78, 0.15);
    --danger: #cf222e;
    --danger-glow: rgba(207, 34, 46, 0.15);
  }
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, .brand {
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  font-weight: 700;
}

a {
  color: var(--accent);
  text-decoration: none;
  transition: color 0.2s;
}
a:hover {
  color: var(--accent-hover);
}

header.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.brand {
  font-size: 20px;
  background: linear-gradient(135deg, var(--accent) 0%, #a2aeff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.grow {
  flex: 1;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.user-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 10px 18px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--accent-glow);
}
.btn:active {
  transform: translateY(0);
}
.btn.ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}
.btn.ghost:hover {
  background: var(--panel-2);
  box-shadow: none;
}

.wrap {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 32px 24px 80px;
}

/* Login Page Styling */
.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 65vh;
  position: relative;
}
.login-glow {
  position: absolute;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, var(--accent-glow) 0%, rgba(0,0,0,0) 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
  pointer-events: none;
}
.login-card {
  position: relative;
  z-index: 1;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 48px 32px;
  max-width: 460px;
  width: 100%;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15);
}
.login-card h1 {
  font-size: 28px;
  margin-bottom: 12px;
  letter-spacing: -0.5px;
}
.login-card p {
  color: var(--muted);
  margin-bottom: 32px;
  font-size: 15px;
}

/* Guild Picker Styling */
.section-header {
  margin-bottom: 24px;
}
.section-header h2 {
  font-size: 24px;
  margin-bottom: 6px;
}
.section-header p {
  color: var(--muted);
  font-size: 14px;
}
.search-container {
  margin-bottom: 24px;
  position: relative;
}
.search-container input {
  width: 100%;
  padding: 12px 16px 12px 44px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
  transition: all 0.2s;
}
.search-container input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.search-container:before {
  content: "🔍";
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  opacity: 0.6;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.guild {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  cursor: pointer;
  transition: all 0.2s;
}
.guild:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px var(--accent-glow);
  text-decoration: none;
}
.guild .ico {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--panel-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  overflow: hidden;
  flex-shrink: 0;
}
.guild .ico img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.guild span strong {
  font-size: 15px;
  color: var(--text);
}

/* Config Page Layout */
.config-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 32px;
  align-items: start;
}
@media (max-width: 768px) {
  .config-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

.sidebar {
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
}
.mod-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.mod-nav-item:hover {
  background: var(--panel-2);
  color: var(--text);
}
.mod-nav-item.active {
  background: var(--accent-glow);
  color: var(--accent);
}
.mod-nav-item .nav-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
  margin-left: auto;
}
.mod-nav-item.enabled .nav-status {
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
}

/* Module Settings Cards */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
}
.config-content .card {
  display: none;
}
.config-content .card.active {
  display: block;
  animation: fadeIn 0.2s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.mod-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.mod-head h3 {
  font-size: 18px;
  margin-bottom: 2px;
}
.mod-fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.disabled-mod {
  opacity: 0.45;
  pointer-events: none;
}

/* Fields & Inputs */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-header label {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--text);
}
.field .hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
.field input[type=text],
.field input[type=number],
.field select {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text);
  font-size: 14px;
  width: 100%;
  transition: all 0.2s;
}
.field input[type=text]:focus,
.field input[type=number]:focus,
.field select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* Beautiful Switch / Toggle */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 24px;
  transition: all 0.2s;
  cursor: pointer;
}
.slider:before {
  content: "";
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
.switch input:checked + .slider {
  background: var(--ok);
}
.switch input:checked + .slider:before {
  transform: translateX(20px);
}

/* Save Status Indicators */
.save-status {
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}
.save-status.saving {
  opacity: 1;
  color: var(--muted);
}
.save-status.saving:after {
  content: "Saving...";
}
.save-status.saved {
  opacity: 1;
  color: var(--ok);
}
.save-status.saved:after {
  content: "✓ Saved";
}
.save-status.error {
  opacity: 1;
  color: var(--danger);
  cursor: help;
}
.save-status.error:after {
  content: "⚠ Error";
}

/* Invite Needed page */
.invite-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
.invite-card {
  text-align: center;
  max-width: 480px;
  width: 100%;
  padding: 40px 32px;
}
.invite-icon {
  font-size: 40px;
  margin-bottom: 16px;
  color: var(--accent);
}
.back-link {
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
}
.back-link:hover {
  color: var(--text);
  text-decoration: none;
}

/* Toast */
#toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  transform: translateY(120px);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 20px;
  font-weight: 600;
  font-size: 14px;
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
  z-index: 1000;
}
#toast.show {
  transform: translateY(0);
}
#toast.ok {
  border-color: var(--ok);
  background: var(--ok-glow);
}
#toast.err {
  border-color: var(--danger);
  background: var(--danger-glow);
}
`;

function getGuildColor(guildId: string): string {
  const colors = [
    "#5865F2", // Discord Blurple
    "#3ba55d", // Green
    "#ed4245", // Red
    "#faa81a", // Yellow
    "#eb459e", // Pink
    "#e67e22", // Orange
    "#9b59b6", // Purple
    "#1abc9c", // Turquoise
  ];
  let hash = 0;
  for (let i = 0; i < guildId.length; i++) {
    hash = guildId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}

function layout(title: string, body: string, session?: Session): string {
  const header = session
    ? `<header class="top">
        <span class="brand">✦ Lumi</span><span class="grow"></span>
        <div class="user-chip">
          <img class="user-avatar" src="${escapeHtml(session.avatar)}" alt="">
          <span class="user-name">${escapeHtml(session.username)}</span>
        </div>
        <a class="btn ghost" href="/logout">Log out</a>
      </header>`
    : "";
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Lumi</title><style>${STYLE}</style></head>
<body>${header}<div class="wrap">${body}</div>
<div id="toast"></div></body></html>`;
}

export function loginPage(): string {
  return layout(
    "Sign in",
    `<div class="login-container">
      <div class="login-glow"></div>
      <div class="login-card">
        <h1>Lumi Control Panel</h1>
        <p>Configure every feature for your Discord servers instantly - no commands required.</p>
        <a class="btn" href="/login">
          <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.51,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.12,123.86,25.29,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/></svg>
          Continue with Discord
        </a>
      </div>
    </div>`,
  );
}

export function guildPicker(session: Session, guilds: OAuthGuild[]): string {
  const cards = guilds.length
    ? guilds
        .map((g) => {
          const icon = guildIconUrl(g.id, g.icon);
          const badge = icon
            ? `<img src="${escapeHtml(icon)}" alt="">`
            : escapeHtml(g.name.slice(0, 1).toUpperCase());
          const customStyle = icon
            ? ""
            : `style="background-color: ${getGuildColor(g.id)}; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.2)"`;
          return `<a class="guild" href="/guild/${escapeHtml(g.id)}" data-name="${escapeHtml(g.name)}">
            <span class="ico" ${customStyle}>${badge}</span>
            <span><strong>${escapeHtml(g.name)}</strong></span>
          </a>`;
        })
        .join("")
    : `<p class="muted">No servers where you have <strong>Manage Server</strong>.</p>`;

  return layout(
    "Your servers",
    `<div class="section-header">
       <h2>Your servers</h2>
       <p>Pick a server to manage. If Lumi isn't there yet, you'll be prompted to invite it.</p>
     </div>
     <div class="search-container">
       <input type="text" id="guildSearch" placeholder="Search servers..." oninput="filterGuilds()">
     </div>
     <div class="grid">${cards}</div>
     <script>
       function filterGuilds() {
         var query = document.getElementById('guildSearch').value.toLowerCase();
         document.querySelectorAll('.guild').forEach(function(el) {
           var name = el.dataset.name.toLowerCase();
           el.style.display = name.includes(query) ? '' : 'none';
         });
       }
     </script>`,
    session,
  );
}

function fieldInput(
  moduleName: string,
  field: ConfigField,
  value: unknown,
): string {
  const id = `f_${escapeHtml(moduleName)}_${escapeHtml(field.key)}`;
  const attrs = `id="${id}" data-module="${escapeHtml(moduleName)}" data-key="${escapeHtml(field.key)}"`;
  switch (field.type) {
    case FieldType.BOOLEAN: {
      const checked = value ? " checked" : "";
      return `<label class="switch"><input type="checkbox" ${attrs} data-kind="bool"${checked}><span class="slider"></span></label>`;
    }
    case FieldType.ENUM: {
      const options = (field.choices ?? [])
        .map(
          (c) =>
            `<option value="${escapeHtml(c)}"${c === value ? " selected" : ""}>${escapeHtml(c)}</option>`,
        )
        .join("");
      return `<select ${attrs} data-kind="str">${options}</select>`;
    }
    case FieldType.NUMBER:
      return `<input type="number" ${attrs} data-kind="num" value="${value === null || value === undefined ? "" : escapeHtml(value)}">`;
    default: {
      const shown = Array.isArray(value) ? value.join(", ") : (value ?? "");
      const ph =
        field.type === FieldType.CHANNEL
          ? "Channel ID"
          : field.type === FieldType.ROLE
            ? "Role ID"
            : field.type === FieldType.USER
              ? "User ID"
              : field.list
                ? "comma, separated, values"
                : "";
      return `<input type="text" ${attrs} data-kind="str" value="${escapeHtml(shown)}" placeholder="${escapeHtml(ph)}">`;
    }
  }
}

export function guildConfigPage(
  session: Session,
  guildId: string,
  data: DashboardData,
): string {
  const sidebarItems = data.modules
    .map((m) => {
      const isCore = m.name === "core";
      const statusClass = m.enabled || isCore ? "enabled" : "";
      return `<div class="mod-nav-item ${statusClass}" data-name="${escapeHtml(m.name)}" data-label="${escapeHtml(m.displayName)}" onclick="showModule('${escapeHtml(m.name)}')">
        <span style="font-size: 16px;">${escapeHtml(m.emoji)}</span>
        <span>${escapeHtml(m.displayName)}</span>
        <span class="nav-status"></span>
      </div>`;
    })
    .join("");

  const modules = data.modules
    .map((m) => {
      const fields = m.configFields
        .map((f) => {
          const inputId = `f_${escapeHtml(m.name)}_${escapeHtml(f.key)}`;
          return `<div class="field">
              <div class="field-header">
                <label for="${inputId}">${escapeHtml(f.label)}</label>
                <span class="save-status" id="status_${inputId}"></span>
              </div>
              ${fieldInput(m.name, f, m.config[f.key])}
              ${f.description ? `<span class="hint">${escapeHtml(f.description)}</span>` : ""}
            </div>`;
        })
        .join("");
      const checked = m.enabled ? " checked" : "";
      const core = m.name === "core";
      return `<div class="card" data-mod="${escapeHtml(m.name)}">
        <div class="mod-head">
          <span style="font-size:24px; line-height: 1.2;">${escapeHtml(m.emoji)}</span>
          <div class="grow">
            <h3>${escapeHtml(m.displayName)}</h3>
            <span class="muted" style="font-size:13px">${escapeHtml(m.description)}</span>
          </div>
          ${
            core
              ? `<span class="muted" style="font-size:12px; font-weight:600; padding: 4px 8px; background: var(--panel-2); border-radius: 4px;">Always Active</span>`
              : `<label class="switch"><input type="checkbox" data-module="${escapeHtml(m.name)}" data-toggle="1"${checked}><span class="slider"></span></label>`
          }
        </div>
        <div class="mod-fields ${m.enabled || core ? "" : "disabled-mod"}">${fields || `<p class="muted" style="margin:8px 0 0">No configurable options.</p>`}</div>
      </div>`;
    })
    .join("");

  const guildIcon = data.icon
    ? `<img src="${escapeHtml(guildIconUrl(guildId, data.icon))}" style="width: 48px; height: 48px; border-radius: 12px; object-fit: cover;">`
    : `<div class="ico" style="width: 48px; height: 48px; border-radius: 12px; font-weight:700; font-size: 18px; display:flex; align-items:center; justify-content:center; background-color: ${getGuildColor(guildId)}; color:#fff;">${escapeHtml(data.name.slice(0, 1).toUpperCase())}</div>`;

  const body = `
    <div class="config-layout">
      <div class="sidebar">
        <p style="margin:0"><a href="/" class="back-link">← All servers</a></p>
        <div style="display:flex; align-items:center; gap:12px; margin: 4px 0 8px;">
          ${guildIcon}
          <h2 style="font-size: 18px; line-height: 1.2; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">${escapeHtml(data.name)}</h2>
        </div>
        <div class="search-container" style="margin-bottom:0">
          <input type="text" id="moduleSearch" placeholder="Search modules..." oninput="filterModules()" style="padding: 10px 12px 10px 38px;">
        </div>
        <div class="sidebar-nav">
          ${sidebarItems}
        </div>
      </div>
      <div class="config-content">
        ${modules}
      </div>
    </div>
    <script>window.__GUILD_ID=${JSON.stringify(guildId)};</script>
    ${CLIENT_SCRIPT}`;

  return layout(data.name, body, session);
}

export function inviteNeededPage(session: Session, guildId: string): string {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`;
  return layout(
    "Invite Lumi",
    `<div class="invite-container">
      <p style="margin-bottom:16px"><a href="/" class="back-link">← All servers</a></p>
      <div class="card invite-card">
        <div class="invite-icon">✦</div>
        <h2>Lumi isn't in this server yet</h2>
        <p class="muted" style="margin-bottom:24px">Invite Lumi to your server or make sure the Dashboard module is enabled for <code>${escapeHtml(guildId)}</code>.</p>
        <a class="btn" href="${inviteUrl}" target="_blank">Invite Lumi</a>
      </div>
    </div>`,
    session,
  );
}

const CLIENT_SCRIPT = `<script>
(function(){
  var toast=document.getElementById("toast");var t;
  function flash(msg,ok){
    toast.textContent=msg;
    toast.className="show "+(ok?"ok":"err");
    clearTimeout(t);
    t=setTimeout(function(){toast.className="";},2500);
  }
  async function post(path,payload){
    var r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!r.ok){
      var e=await r.json().catch(function(){return{};});
      throw new Error(e.error||("HTTP "+r.status));
    }
    return r.json();
  }
  var gid=window.__GUILD_ID;
  
  document.querySelectorAll("[data-toggle]").forEach(function(el){
    el.addEventListener("change",async function(){
      var modName = el.dataset.module;
      var navItem = document.querySelector(".mod-nav-item[data-name='"+modName+"']");
      try{
        await post("/api/guild/"+gid+"/module",{moduleName:modName,enabled:el.checked});
        var body=el.closest(".card").querySelector(".mod-fields");
        if(body) body.classList.toggle("disabled-mod",!el.checked);
        if(navItem) {
          if(el.checked) navItem.classList.add("enabled");
          else navItem.classList.remove("enabled");
        }
        flash("Module "+(el.checked?"enabled":"disabled"),true);
      }catch(err){
        el.checked=!el.checked;
        flash(err.message,false);
      }
    });
  });

  document.querySelectorAll("[data-key]").forEach(function(el){
    el.addEventListener("change",async function(){
      var v;
      if(el.dataset.kind==="bool") v=el.checked;
      else if(el.dataset.kind==="num") v=el.value===""?null:Number(el.value);
      else v=el.value;
      
      var statusIndicator = document.getElementById("status_" + el.id);
      if (statusIndicator) {
        statusIndicator.className = "save-status saving";
      }

      try{
        await post("/api/guild/"+gid+"/config",{moduleName:el.dataset.module,key:el.dataset.key,value:v});
        if (statusIndicator) {
          statusIndicator.className = "save-status saved";
          setTimeout(function() {
            if (statusIndicator.className === "save-status saved") {
              statusIndicator.className = "save-status";
            }
          }, 2000);
        }
      }catch(err){
        if (statusIndicator) {
          statusIndicator.className = "save-status error";
          statusIndicator.title = err.message;
        }
        flash(err.message,false);
      }
    });
  });

  window.showModule = function(moduleName) {
    document.querySelectorAll('.config-content .card').forEach(function(card) {
      if (card.dataset.mod === moduleName) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
    document.querySelectorAll('.mod-nav-item').forEach(function(item) {
      if (item.dataset.name === moduleName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    try {
      history.replaceState(null, null, '#' + moduleName);
    } catch (err) {
      console.warn('Failed to update location hash:', err);
    }
  };

  window.filterModules = function() {
    var query = document.getElementById('moduleSearch').value.toLowerCase();
    document.querySelectorAll('.mod-nav-item').forEach(function(el) {
      var name = el.dataset.name.toLowerCase();
      var label = el.dataset.label.toLowerCase();
      if (name.includes(query) || label.includes(query)) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  };

  var hash = location.hash.substring(1);
  var firstModEl = document.querySelector('.config-content .card');
  var firstMod = firstModEl ? firstModEl.dataset.mod : null;
  if (firstMod) {
    window.showModule(hash || firstMod);
  }
})();
</script>`;
