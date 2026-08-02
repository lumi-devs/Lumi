import { FieldType } from "@lumi/contracts";
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

const SLEEK_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg-dark: #07080c;
  --bg-card: rgba(15, 17, 26, 0.75);
  --bg-card-hover: rgba(22, 25, 38, 0.85);
  --bg-input: #121420;
  --border: rgba(255, 255, 255, 0.07);
  --border-glow: rgba(99, 102, 241, 0.35);
  
  --accent-primary: #6366f1;
  --accent-secondary: #8b5cf6;
  --accent-cyan: #06b6d4;
  --accent-emerald: #10b981;
  --accent-rose: #f43f5e;
  
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --text-dim: #64748b;
  
  --glass-bg: rgba(13, 15, 24, 0.65);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: blur(16px);
  --shadow-lg: 0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.15);
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }

body {
  background: var(--bg-dark);
  color: var(--text-main);
  line-height: 1.5;
  min-height: 100vh;
  overflow-x: hidden;
  background-image: 
    radial-gradient(ellipse 80% 80% at 50% -20%, rgba(99, 102, 241, 0.15), rgba(255, 255, 255, 0)),
    radial-gradient(circle at 85% 85%, rgba(139, 92, 246, 0.08), transparent 40%);
  background-attachment: fixed;
}

/* Glassmorphism Header */
header.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-border);
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.brand-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 800;
  font-size: 18px;
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.4);
}

.brand-title {
  font-family: 'Outfit', sans-serif;
  font-size: 22px;
  font-weight: 800;
  background: linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  padding: 8px 16px;
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 240px;
}
.search-trigger:hover {
  border-color: var(--border-glow);
  color: var(--text-main);
  background: rgba(255,255,255,0.03);
}

.kbd-badge {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  margin-left: auto;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cluster-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent-emerald);
  background: rgba(16, 185, 129, 0.1);
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.pulse-dot {
  width: 7px;
  height: 7px;
  background: var(--accent-emerald);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent-emerald);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
  padding: 4px 12px 4px 4px;
  border-radius: 30px;
  border: 1px solid var(--border);
}
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.user-name {
  font-size: 13px;
  font-weight: 600;
}

.btn-logout {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-logout:hover {
  background: rgba(244, 63, 94, 0.1);
  color: var(--accent-rose);
  border-color: rgba(244, 63, 94, 0.3);
}

/* App Main Layout */
.dashboard-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px;
}

/* Stat Cards Overview */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 32px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  position: relative;
  overflow: hidden;
  backdrop-filter: var(--glass-blur);
  transition: all 0.25s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-glow);
  box-shadow: var(--shadow-lg);
}
.stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stat-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}
.stat-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: rgba(255,255,255,0.05);
}
.stat-value {
  font-family: 'Outfit', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: var(--text-main);
}
.stat-trend {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-emerald);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

/* Two Column Workspace */
.workspace-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 28px;
}

/* Sidebar Module Selector */
.sidebar-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 20px;
  backdrop-filter: var(--glass-blur);
  height: fit-content;
}
.server-badge-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.server-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f43f5e, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 18px;
  color: #fff;
}
.server-info h3 {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}
.server-info p {
  font-size: 12px;
  color: var(--text-muted);
}

.module-nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.module-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  text-decoration: none;
}
.module-nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main);
}
.module-nav-item.active {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1));
  color: #fff;
  border-color: var(--border-glow);
  font-weight: 600;
}
.nav-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.status-pill {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
}
.status-pill.active {
  background: var(--accent-emerald);
  box-shadow: 0 0 8px var(--accent-emerald);
}

/* Main Content Panel */
.main-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 32px;
  backdrop-filter: var(--glass-blur);
}
.module-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 24px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.module-hero-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.module-large-emoji {
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15));
  border: 1px solid var(--border-glow);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}
.module-title-wrap h2 {
  font-size: 22px;
  font-weight: 800;
}
.module-title-wrap p {
  font-size: 13px;
  color: var(--text-muted);
}

/* Switch Toggle Styling */
.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 26px;
}
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(255,255,255,0.1);
  transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 34px;
  border: 1px solid var(--border);
}
.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
}
input:checked + .slider {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
}
input:checked + .slider:before {
  transform: translateX(24px);
}

/* Field Controls Grid */
.config-section-title {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--accent-primary);
  margin: 24px 0 16px 0;
}

.field-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 16px;
  transition: border 0.2s;
}
.field-card:hover {
  border-color: rgba(255,255,255,0.15);
}
.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.field-label {
  font-size: 15px;
  font-weight: 600;
}
.field-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.input-control {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  color: var(--text-main);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}
.input-control:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.25);
}

/* Floating Save Bar */
.floating-save-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e1b4b;
  border: 1px solid var(--accent-primary);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.4);
  padding: 12px 24px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  gap: 20px;
  z-index: 200;
}
.save-text {
  font-size: 14px;
  font-weight: 600;
}
.btn-save {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #fff;
  border: none;
  padding: 8px 18px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

/* Login Page Styling */
.hero-center {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 48px;
  border-radius: 24px;
  text-align: center;
  max-width: 440px;
  width: 100%;
  box-shadow: var(--shadow-lg);
  backdrop-filter: var(--glass-blur);
}
.login-icon {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  margin: 0 auto 20px auto;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
}
.login-card h1 {
  font-size: 26px;
  margin-bottom: 8px;
}
.login-card p {
  color: var(--text-muted);
  font-size: 14px;
  margin-bottom: 28px;
}
.btn-discord-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  background: #5865f2;
  color: #fff;
  padding: 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(88, 101, 242, 0.35);
}
.btn-discord-login:hover {
  background: #4752c4;
  transform: translateY(-1px);
}
`;

export function loginPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In · Lumi Control Panel</title>
  <style>${SLEEK_STYLE}</style>
</head>
<body>
  <div class="hero-center">
    <div class="login-card">
      <div class="login-icon">✦</div>
      <h1>Lumi Control Panel</h1>
      <p>Manage, configure, and automate your Discord servers instantly with full control.</p>
      <a href="/login" class="btn-discord-login">
        <svg width="20" height="15" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M60.1 4.9A57.7 57.7 0 0045.6.4a.2.2 0 00-.2.1c-.6 1.2-1.3 2.6-1.8 3.8a53.3 53.3 0 00-16 0 37.4 37.4 0 00-1.9-3.8.2.2 0 00-.2-.1 57.6 57.6 0 00-14.5 4.5.2.2 0 00-.1.1C1.6 18.5-.7 31.7.2 44.8a.2.2 0 00.1.2 57.9 57.9 0 0017.5 8.8.2.2 0 00.2-.1c1.4-1.9 2.6-3.9 3.7-6a.2.2 0 00-.1-.3 38.2 38.2 0 01-5.4-2.6.2.2 0 01 0-.3c.4-.3.7-.6 1.1-.9a.2.2 0 01.2 0c11.5 5.3 24 5.3 35.3 0a.2.2 0 01.2 0c.4.3.7.6 1.1.9a.2.2 0 010 .3 36 36 0 01-5.4 2.6.2.2 0 00-.1.3c1.1 2.1 2.3 4.1 3.7 6a.2.2 0 00.2.1 57.7 57.7 0 0017.5-8.8.2.2 0 00.1-.2c1.1-15.1-1.9-28.2-10.7-39.7a.2.2 0 00-.1-.1zM23.7 36.9c-3.4 0-6.3-3.1-6.3-7s2.8-7 6.3-7c3.5 0 6.4 3.2 6.3 7 0 3.9-2.8 7-6.3 7zm23.6 0c-3.4 0-6.3-3.1-6.3-7s2.8-7 6.3-7c3.5 0 6.4 3.2 6.3 7 0 3.9-2.8 7-6.3 7z" fill="white"/>
        </svg>
        Continue with Discord
      </a>
    </div>
  </div>
</body>
</html>`;
}

export function guildPicker(session: Session, guilds: OAuthGuild[]): string {
  const cards = guilds.map((g) => {
    const icon = guildIconUrl(g.id, g.icon);
    const initial = g.name.charAt(0).toUpperCase();
    return `
      <a href="/guild/${g.id}" class="stat-card" style="text-decoration:none; cursor:pointer;">
        <div class="stat-header">
          <div style="display:flex; align-items:center; gap:14px;">
            ${icon ? `<img src="${icon}" style="width:44px; height:44px; border-radius:12px;" />` : `<div class="server-icon">${initial}</div>`}
            <div>
              <h3 style="font-size:16px; font-weight:700; color:var(--text-main);">${escapeHtml(g.name)}</h3>
              <span style="font-size:12px; color:var(--text-muted);">${g.owner ? "Owner" : "Admin"}</span>
            </div>
          </div>
          <span style="color:var(--accent-primary); font-weight:700; font-size:14px;">Configure →</span>
        </div>
      </a>
    `;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Servers · Lumi</title>
  <style>${SLEEK_STYLE}</style>
</head>
<body>
  <header class="app-header">
    <a href="/" class="brand-logo">
      <div class="brand-icon">✦</div>
      <span class="brand-title">Lumi</span>
    </a>
    <div class="user-profile">
      <img src="${session.avatar}" class="user-avatar" />
      <span class="user-name">${escapeHtml(session.username)}</span>
      <a href="/logout" class="btn-logout">Logout</a>
    </div>
  </header>

  <main class="dashboard-container">
    <div style="margin-bottom: 32px;">
      <h1 style="font-family:'Outfit', sans-serif; font-size: 28px; font-weight: 800;">Select a Server</h1>
      <p style="color:var(--text-muted); font-size: 14px;">Choose a server to configure modules, moderation rules, and security policies.</p>
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
      ${cards}
    </div>
  </main>
</body>
</html>`;
}

export function guildConfigPage(session: Session, guildId: string, data: DashboardData): string {
  const activeModule = data.modules.find((m) => m.enabled) || data.modules[0];
  
  const navItems = data.modules.map((m) => `
    <a href="/guild/${guildId}?module=${m.name}" class="module-nav-item ${m.name === activeModule?.name ? 'active' : ''}">
      <div class="nav-item-left">
        <span>${m.emoji || '⚙️'}</span>
        <span>${escapeHtml(m.displayName)}</span>
      </div>
      <div class="status-pill ${m.enabled ? 'active' : ''}"></div>
    </a>
  `).join("");

  const fieldsHtml = activeModule ? activeModule.configFields.map((f) => {
    const val = activeModule.config[f.key] ?? f.default ?? "";
    return `
      <div class="field-card">
        <div class="field-header">
          <label class="field-label">${escapeHtml(f.label)}</label>
          ${f.type === FieldType.BOOLEAN ? `
            <label class="switch">
              <input type="checkbox" ${val ? 'checked' : ''} onchange="toggleConfig('${activeModule.name}', '${f.key}', this.checked)">
              <span class="slider"></span>
            </label>
          ` : ''}
        </div>
        <p class="field-desc">${escapeHtml(f.description)}</p>
        ${f.type !== FieldType.BOOLEAN ? `
          <input type="text" class="input-control" value="${escapeHtml(val)}" onchange="updateConfig('${activeModule.name}', '${f.key}', this.value)" />
        ` : ''}
      </div>
    `;
  }).join("") : "<p>No configuration fields available.</p>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.name)} · Lumi Dashboard</title>
  <style>${SLEEK_STYLE}</style>
</head>
<body>
  <header class="app-header">
    <a href="/" class="brand-logo">
      <div class="brand-icon">✦</div>
      <span class="brand-title">Lumi</span>
    </a>

    <div class="search-trigger">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <span>Search settings & modules...</span>
      <span class="kbd-badge">⌘K</span>
    </div>

    <div class="header-actions">
      <div class="cluster-status">
        <div class="pulse-dot"></div>
        <span>Cluster 01 • 14ms</span>
      </div>
      <div class="user-profile">
        <img src="${session.avatar}" class="user-avatar" />
        <span class="user-name">${escapeHtml(session.username)}</span>
      </div>
      <a href="/logout" class="btn-logout">Logout</a>
    </div>
  </header>

  <main class="dashboard-container">
    <!-- Live Analytics Bar -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Total Server Members</span>
          <div class="stat-icon">👥</div>
        </div>
        <div class="stat-value">14,280</div>
        <div class="stat-trend">↑ +12% this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Moderation Cases</span>
          <div class="stat-icon">🛡️</div>
        </div>
        <div class="stat-value">142</div>
        <div class="stat-trend" style="color:var(--accent-primary);">Active Modlogs</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Threats Neutralized</span>
          <div class="stat-icon">🔐</div>
        </div>
        <div class="stat-value">389</div>
        <div class="stat-trend">Anti-Nuke Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-title">Active Temp VCs</span>
          <div class="stat-icon">🔊</div>
        </div>
        <div class="stat-value">18</div>
        <div class="stat-trend" style="color:var(--accent-cyan);">Live Channels</div>
      </div>
    </div>

    <!-- Workspace Grid -->
    <div class="workspace-grid">
      <aside class="sidebar-panel">
        <div class="server-badge-card">
          <div class="server-icon">${data.name.charAt(0)}</div>
          <div class="server-info">
            <h3>${escapeHtml(data.name)}</h3>
            <p>ID: ${guildId}</p>
          </div>
        </div>
        <div class="module-nav-list">
          ${navItems}
        </div>
      </aside>

      <section class="main-panel">
        ${activeModule ? `
          <div class="module-hero">
            <div class="module-hero-left">
              <div class="module-large-emoji">${activeModule.emoji || '⚙️'}</div>
              <div class="module-title-wrap">
                <h2>${escapeHtml(activeModule.displayName)}</h2>
                <p>${escapeHtml(activeModule.description)}</p>
              </div>
            </div>
            <label class="switch">
              <input type="checkbox" ${activeModule.enabled ? 'checked' : ''} onchange="toggleModule('${activeModule.name}', this.checked)">
              <span class="slider"></span>
            </label>
          </div>
          ${fieldsHtml}
        ` : '<p>Select a module from the left sidebar to configure.</p>'}
      </section>
    </div>
  </main>

  <script>
    async function toggleModule(moduleName, enabled) {
      await fetch('/api/guild/${guildId}/module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleName, enabled })
      });
      location.reload();
    }
    async function updateConfig(moduleName, key, value) {
      await fetch('/api/guild/${guildId}/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleName, key, value })
      });
    }
    async function toggleConfig(moduleName, key, value) {
      updateConfig(moduleName, key, value);
    }
  </script>
</body>
</html>`;
}

export function inviteNeededPage(_session: Session, _guildId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Invite Bot · Lumi</title>
  <style>${SLEEK_STYLE}</style>
</head>
<body>
  <div class="hero-center">
    <div class="login-card">
      <div class="login-icon">🤖</div>
      <h1>Bot Not Invited</h1>
      <p>Lumi is not currently present in this server. Invite Lumi to manage settings.</p>
      <a href="https://discord.com/oauth2/authorize?client_id=${config.clientId || '123'}&scope=bot&permissions=8" target="_blank" class="btn-discord-login">
        Add Lumi to Server
      </a>
    </div>
  </div>
</body>
</html>`;
}
