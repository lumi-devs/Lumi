import { FieldType, type ConfigField } from "@lumi/contracts";
import { guildIconUrl } from "./discord.js";
import type { DashboardData, OAuthGuild, Session } from "./types.js";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
:root{color-scheme:light dark;--bg:#0d0f14;--panel:#161a22;--panel-2:#1d222c;--border:#272d39;--text:#e7ebf2;--muted:#8b93a3;--accent:#5865f2;--accent-2:#4752c4;--ok:#3ba55d;--danger:#ed4245}
@media(prefers-color-scheme:light){:root{--bg:#f5f6f8;--panel:#fff;--panel-2:#f0f2f5;--border:#e2e5ea;--text:#1a1d24;--muted:#5a6373}}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:820px;margin:0 auto;padding:24px 20px 64px}
header.top{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border);background:var(--panel)}
header.top .grow{flex:1}
header.top img{width:32px;height:32px;border-radius:50%}
.brand{font-weight:700;letter-spacing:.2px}
.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer;font-size:14px}
.btn:hover{background:var(--accent-2);text-decoration:none}
.btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.guild{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--panel);cursor:pointer}
.guild:hover{border-color:var(--accent);text-decoration:none}
.guild .ico{width:40px;height:40px;border-radius:10px;background:var(--panel-2);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden}
.guild .ico img{width:100%;height:100%;object-fit:cover}
.mod-head{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.mod-head .grow{flex:1}
.mod-head h3{margin:0;font-size:17px}
.field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:1px solid var(--border)}
.field label{font-weight:600;font-size:14px}
.field .hint{color:var(--muted);font-size:12px}
.field input[type=text],.field input[type=number],.field select{background:var(--panel-2);border:1px solid var(--border);border-radius:8px;padding:9px 11px;color:var(--text);font-size:14px;width:100%}
.field input:focus,.field select:focus{outline:2px solid var(--accent);outline-offset:-1px}
.switch{position:relative;display:inline-block;width:44px;height:24px}
.switch input{opacity:0;width:0;height:0}
.slider{position:absolute;inset:0;background:var(--border);border-radius:24px;transition:.15s;cursor:pointer}
.slider:before{content:"";position:absolute;height:18px;width:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}
.switch input:checked+.slider{background:var(--ok)}
.switch input:checked+.slider:before{transform:translateX(20px)}
.disabled-mod{opacity:.55}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-weight:600;transition:transform .25s;box-shadow:0 8px 24px rgba(0,0,0,.3)}
#toast.show{transform:translateX(-50%) translateY(0)}
#toast.ok{border-color:var(--ok)}#toast.err{border-color:var(--danger)}
`;

function layout(title: string, body: string, session?: Session): string {
  const header = session
    ? `<header class="top">
        <span class="brand">✦ Lumi</span><span class="grow"></span>
        <span class="muted">${escapeHtml(session.username)}</span>
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
    `<div class="card" style="text-align:center;margin-top:12vh">
      <h1 style="margin:0 0 8px">Lumi Control Panel</h1>
      <p class="muted" style="margin:0 0 24px">Configure every feature for your servers — no commands required.</p>
      <a class="btn" href="/login">Continue with Discord</a>
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
          return `<a class="guild" href="/guild/${escapeHtml(g.id)}">
            <span class="ico">${badge}</span>
            <span><strong>${escapeHtml(g.name)}</strong></span>
          </a>`;
        })
        .join("")
    : `<p class="muted">No servers where you have <strong>Manage Server</strong>.</p>`;
  return layout(
    "Your servers",
    `<h2>Your servers</h2>
     <p class="muted">Pick a server to manage. If Lumi isn't there yet, you'll be prompted to invite it.</p>
     <div class="grid">${cards}</div>`,
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
      // STRING / CHANNEL / ROLE / USER — free text (IDs for entity fields).
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
  const modules = data.modules
    .map((m) => {
      const fields = m.configFields
        .map(
          (f) => `<div class="field">
            <label for="f_${escapeHtml(m.name)}_${escapeHtml(f.key)}">${escapeHtml(f.label)}</label>
            ${fieldInput(m.name, f, m.config[f.key])}
            ${f.description ? `<span class="hint">${escapeHtml(f.description)}</span>` : ""}
          </div>`,
        )
        .join("");
      const checked = m.enabled ? " checked" : "";
      const core = m.name === "core";
      return `<div class="card" data-mod="${escapeHtml(m.name)}">
        <div class="mod-head">
          <span style="font-size:20px">${escapeHtml(m.emoji)}</span>
          <div class="grow"><h3>${escapeHtml(m.displayName)}</h3>
            <span class="muted" style="font-size:13px">${escapeHtml(m.description)}</span></div>
          ${
            core
              ? `<span class="muted" style="font-size:12px">Always on</span>`
              : `<label class="switch"><input type="checkbox" data-module="${escapeHtml(m.name)}" data-toggle="1"${checked}><span class="slider"></span></label>`
          }
        </div>
        <div class="mod-fields ${m.enabled || core ? "" : "disabled-mod"}">${fields || `<p class="muted" style="margin:8px 0 0">No configurable options.</p>`}</div>
      </div>`;
    })
    .join("");

  const body = `
    <p style="margin:0"><a href="/">← All servers</a></p>
    <h2 style="margin:8px 0 0">${escapeHtml(data.name)}</h2>
    <p class="muted" style="margin:4px 0 8px">Changes save automatically.</p>
    ${modules}
    <script>window.__GUILD_ID=${JSON.stringify(guildId)};</script>
    ${CLIENT_SCRIPT}`;
  return layout(data.name, body, session);
}

export function inviteNeededPage(session: Session, guildId: string): string {
  return layout(
    "Invite Lumi",
    `<p><a href="/">← All servers</a></p>
     <div class="card">
       <h2>Lumi isn't in this server yet</h2>
       <p class="muted">Invite Lumi (or enable the Dashboard module) for <code>${escapeHtml(guildId)}</code>, then reload this page.</p>
     </div>`,
    session,
  );
}

const CLIENT_SCRIPT = `<script>
(function(){
  var toast=document.getElementById("toast");var t;
  function flash(msg,ok){toast.textContent=msg;toast.className="show "+(ok?"ok":"err");clearTimeout(t);t=setTimeout(function(){toast.className="";},1800);}
  async function post(path,payload){
    var r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!r.ok){var e=await r.json().catch(function(){return{};});throw new Error(e.error||("HTTP "+r.status));}
    return r.json();
  }
  var gid=window.__GUILD_ID;
  document.querySelectorAll("[data-toggle]").forEach(function(el){
    el.addEventListener("change",async function(){
      try{await post("/api/guild/"+gid+"/module",{moduleName:el.dataset.module,enabled:el.checked});
        var body=el.closest(".card").querySelector(".mod-fields");if(body)body.classList.toggle("disabled-mod",!el.checked);
        flash("Module "+(el.checked?"enabled":"disabled"),true);
      }catch(err){el.checked=!el.checked;flash(err.message,false);}
    });
  });
  document.querySelectorAll("[data-key]").forEach(function(el){
    el.addEventListener("change",async function(){
      var v;if(el.dataset.kind==="bool")v=el.checked;else if(el.dataset.kind==="num")v=el.value===""?null:Number(el.value);else v=el.value;
      try{await post("/api/guild/"+gid+"/config",{moduleName:el.dataset.module,key:el.dataset.key,value:v});flash("Saved",true);}
      catch(err){flash(err.message,false);}
    });
  });
})();
</script>`;
