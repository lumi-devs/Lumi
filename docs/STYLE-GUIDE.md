# Lumi Documentation Style Guide

**Version**: 1.0  
**Effective**: Wave 10 (2026-09-03)  
**Scope**: All documentation in `apps/docs/src/content/docs/` and GitHub repo root

This guide ensures consistency, clarity, and professionalism across all Lumi documentation.

---

## 1. Frontmatter

Every markdown file **must** begin with YAML frontmatter. Required fields:

```yaml
---
title: "Page Title (Imperative, User-Facing)"
description: "One-sentence summary of what the page covers."
category: "Category Name"
---
```

### Title Rules
- Use **imperative voice** where appropriate: "Deploying to Production", "Configuring Modules", "Testing Your Addon"
- Use **noun phrases** for reference docs: "Architecture & System Topology", "Permission Nodes", "API Reference"
- Keep under 60 characters
- Capitalize main words (title case)

### Description Rules
- One sentence, 50–100 characters
- Concise, SEO-friendly
- Not a full paragraph

### Category Rules
Use one of these exact categories:

| Category | Example Pages |
| :--- | :--- |
| **Getting Started** | Quick start, self-hosting setup, first addon |
| **Core Architecture** | System topology, database, event bus |
| **Addon SDK** | API reference, module creation, patterns |
| **User Guide** | Commands, permissions, dashboard |
| **Operations & Runbooks** | Deployment, monitoring, scaling, backup |
| **Governance & Help** | FAQ, troubleshooting, privacy |

**Example**:
```yaml
---
title: "Scaling to Production"
description: "Shard sizing, connection pooling, and performance tuning."
category: "Operations & Runbooks"
---
```

---

## 2. Structure & Headings

### Hierarchy
- **H1 (`#`)**: Never use in content; reserved for page title (auto-generated from frontmatter)
- **H2 (`##`)**: Main sections (1–5 per page)
- **H3 (`###`)**: Subsections
- **H4 (`####`)**: Sub-subsections (use sparingly)

### Section Naming
- Use consistent patterns: "Overview", "Configuration", "Examples", "Troubleshooting"
- Use imperative for task-oriented pages: "Getting Started", "Setting Up", "Deploying"
- Use noun phrases for reference pages: "Architecture", "Permissions", "Database Schema"

**Example Structure**:
```markdown
## Overview
(Intro paragraph, what you'll learn)

## Requirements
(Prerequisites, software versions)

## Step 1: Setup
(Detailed walkthrough)

## Step 2: Configuration
(How to configure)

## Examples
(Code/configuration examples)

## Troubleshooting
(Common issues & fixes)

## Next Steps
(What to do after finishing)
```

### Table of Contents
- Add manually for pages with **5+ sections**
- Use format:
  ```markdown
  ## Table of Contents
  - [Section 1](#section-1)
  - [Section 2](#section-2)
  - [Subsection 2.1](#subsection-21)
  ```

---

## 3. Terminology & Voice

### Terminology Reference Table
| Term | Usage | Example |
| :--- | :--- | :--- |
| **Guild** | A Discord server | "In each guild, you can configure modules independently." |
| **Member** | A user who joined a guild | "Members can use `/help` to see available commands." |
| **User** | A Discord user (not always in your guild) | "User ID 123... triggered a ban appeal." |
| **Addon** | Third-party module (installed dynamically) | "Download an addon from the registry." |
| **Module** | Built-in feature (or generic term for both) | "The `mod` module provides bans and kicks." |
| **Permit** | Permission node (dot-notation) | "The `mod.ban` permit gates the `/ban` command." |
| **Panel** | Web dashboard or Discord command UI | "Open the `/lumi panel` to toggle modules." |
| **Shard** | Discord bot shard (not usually end-user concern) | "Shard 0 is elected primary and runs the scheduler." |
| **Event Bus** | Redis Streams message queue | "The event bus relays task fires across shards." |
| **RPC** | Internal HTTP bridge (worker ↔ dashboard) | "Dashboard calls use the RPC bridge." |

### Voice & Tone
- **Friendly, professional**: Assume users are smart, not experts in Discord bots
- **Active voice**: "Lumi stores logs" not "Logs are stored by Lumi"
- **Second person for guides**: "You'll configure…", "You can toggle…"
- **Third person for reference**: "The `mod` module provides…", "This field accepts…"
- **Avoid marketing speak**: Use "reliable" not "enterprise-grade", "straightforward" not "intuitive"

**Example**:
```markdown
❌ "Permits are a powerful abstraction allowing operators to grok hierarchical access."
✅ "Permits use dot notation (like `mod.ban`, `admin.*`) to control who can run each command."
```

---

## 4. Code & Examples

### Code Block Format
Always specify language:
```typescript
// Good
import { Module } from "lumi";

// Bad (no language)
import { Module } from "lumi";
```

### Code Block Rules
- Include **language tag** (typescript, bash, json, yaml, etc.)
- Keep blocks **under 20 lines** (or split into sections)
- **Runnable code** should compile as-is (test it)
- **Pseudocode or config examples** can be illustrative
- Use **comments** to explain non-obvious lines
- Use `// ...` ellipsis to skip unimportant code

### Example: Command
```typescript
import { BaseCommand, CommandContext } from "lumi/commands";

export class HelloCommand extends BaseCommand {
  public constructor(context: BaseCommand.LoaderContext, options: BaseCommand.Options) {
    super(context, { ...options, name: "hello" });
  }

  public async chatInputRun(ctx: CommandContext) {
    await ctx.replySuccess("Hello", "You invoked the hello command!");
  }
}
```

### Example: Configuration
```yaml
# docker-compose.yml (production)
services:
  worker:
    image: ghcr.io/lumi-devs/worker:latest
    environment:
      BOT_TOKEN: ${BOT_TOKEN}
      POSTGRES_URL: postgresql://lumi@postgres:5432/lumi
    depends_on:
      postgres:
        condition: service_healthy
```

### Example: Command Usage
```bash
# Start the bot in development
bun run dev

# Run tests
bun run test

# Deploy to production
docker compose -f docker-compose.prod.yml up -d
```

### Inline Code
- Use backticks for: `commandName`, `module-name`, filenames, variable names, paths
- Use **bold** for menu items: Click **Settings** → **Modules**
- Use monospace for Discord mentions: `@BotName`, `#channel-name`

---

## 5. Tables

### Format Rules
- **Clear headers** (use `---` to separate header from body)
- **Left-align text**, right-align numbers
- **Escape pipes** in cell content: `\|`
- **Keep tables narrow** (max 4–5 columns; split into multiple tables if needed)

### Example: Good
```markdown
| Command | Requires Permit | Example |
| :--- | :---: | :--- |
| `/ban` | `mod.ban` | `/ban @user spam` |
| `/mute` | `mod.mute` | `/mute @user 1h` |
```

### Example: Bad
```markdown
| Command | Description | Permit | Aliases | Usage | Error Handling |
| `/ban` | Bans a user | mod.ban | b, block | /ban @user | Sends error card |
```
(Too many columns, hard to read)

---

## 6. Links & References

### Internal Links (Cross-Docs)
Link to related pages using **relative paths** (without `.md` extension):

```markdown
❌ [Module Creation Guide](/guides/module-creation.md)
✅ [Module Creation Guide](/guides/module-creation)
✅ [Architecture Overview](/architecture)
```

### External Links
Use full URLs:

```markdown
❌ [Discord.js docs](https://discord.js.org)
✅ [discord.js documentation](https://discord.js.org)
```

### GitHub Links
Use short, canonical URLs:

```markdown
❌ https://github.com/lumi-devs/Lumi/blob/main/packages/core/src/lib/commands.ts
✅ [CommandContext](/CONTRIBUTING.md#code-standards--architectural-rules) (internal)
✅ [discord.js Guide](https://discordjs.guide/) (external)
```

### Anchor Links
For same-page jumps:

```markdown
## Getting Started
(content)

## Troubleshooting
See [Getting Started](#getting-started) for setup issues.
```

### Link Text Rules
- Descriptive text, not "click here"
- Avoid "learn more" (use the topic name)

```markdown
❌ For more info, [click here](../guides/module-creation)
✅ See the [Module Creation Guide](../guides/module-creation)
```

---

## 7. Formatting & Emphasis

### Bold (Strong Emphasis)
Use **bold** for:
- Menu paths: Click **Settings** → **Modules**
- Emphasis on important terms: "This is a **critical** configuration"
- UI element names: Click the **Save** button

```markdown
❌ Use the *database connection pool*
✅ Use the **database connection pool** for Postgres
```

### Italic (Emphasis)
Use *italics* sparingly:
- Foreign words, technical terms you're defining
- Book/publication titles

```markdown
The *event bus* (Redis Streams-based message queue) relays…
```

### Code (Inline)
Use backticks for:
- Function names: `container.db.guilds.get()`
- Variable names: `BOT_TOKEN`
- File paths: `apps/dashboard/src/`
- Configuration keys: `POSTGRES_URL`
- Command names: `/help`

### Lists
- Use **unordered lists** (`-`) for non-sequential items
- Use **ordered lists** (`1.`) for sequential steps
- Indent sub-items with 2 spaces

**Example**:
```markdown
## Requirements
- Bun 1.3+
- PostgreSQL 18
- Redis 8

## Setup Steps
1. Clone the repository
   ```bash
   git clone https://github.com/lumi-devs/lumi.git
   ```
2. Install dependencies
3. Configure `.env`
```

---

## 8. Diagrams & Visuals

### ASCII Diagrams
Use for simple system topology:

```
                    Internet / Discord Gateway
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
           ┌─────────────┐       ┌─────────────┐
           │   Worker-0  │       │   Worker-1  │
           │ (Primary)   │       │ (Shard Only)│
           └──────┬──────┘       └──────┬──────┘
                  │                     │
          ┌───────┴─────────┬───────────┤
          ▼                 ▼           ▼
       Postgres         Redis      Dashboard
```

### Rules for ASCII Art
- Use box-drawing characters: `│`, `─`, `┌`, `┐`, `└`, `┘`, `├`, `┤`, `┬`, `┴`, `┼`, `▼`, `►`
- Keep under 80 columns (readable on narrow screens)
- Add text labels above or below
- Use `┌─┐` for boxes, `│ │` for lines

### Inline Images
- Use markdown syntax: `![alt text](../path/to/image.png)`
- Alt text describes what's in the image
- Keep image size reasonable (max 1200px wide)
- Prefer PNG for screenshots, SVG for diagrams

### When NOT to Use Visuals
- Don't make a diagram the only way to understand something
- Provide text explanation + diagram
- Don't embed images with no alt text

---

## 9. Notes, Warnings, & Callouts

### Info Box
```markdown
> [!NOTE]
> This is helpful context that clarifies a concept.
```

### Warning
```markdown
> [!WARNING]
> This is a common mistake or safety issue. Read carefully.
```

### Important
```markdown
> [!IMPORTANT]
> This is critical information. Don't skip this.
```

### Tip
```markdown
> [!TIP]
> This is a best practice or shortcut you might not know.
```

### Rules
- Use sparingly (1–2 per page max)
- Put after the section introducing the topic
- Keep short (1–3 sentences)

**Example**:
```markdown
## Configuration

> [!IMPORTANT]
> The `RPC_INTERNAL_TOKEN` must match between the worker and dashboard, or they cannot communicate. Generate a new 32-byte hex string with `openssl rand -hex 32` and set it identically in both `.env` files.

To configure the bot:
```

---

## 10. Code Examples & Runnable Tests

### Rule: Every Example Must Be Valid
- Code examples should compile (or be marked as "pseudocode")
- Link or reference actual working code when possible
- Call out hypothetical examples: `// Hypothetical example:`

### Built-In Examples
Reference real examples in the repo:

```markdown
See [Hello World](https://github.com/lumi-devs/Lumi/blob/main/examples/hello-world/) for a complete addon example.
```

### Pseudo-Code Marker
```typescript
// Hypothetical example showing the pattern:
export class MyModule extends Module {
  // Implementation...
}
```

### Copy-Paste Ready
Mark blocks that readers should copy:

```bash
# Run this command
bun run test
```

---

## 11. Accessibility

### Text Contrast
- Ensure 4.5:1 minimum text:background contrast
- Test on docs site in both light & dark themes

### Readable Font Size
- Base: 14–16px (readable, not microscopic)
- Code blocks: 13px minimum
- Headings: use semantic hierarchy (H2, H3, etc.)

### Alt Text for Images
```markdown
![A schematic showing the worker-to-dashboard RPC bridge over HTTP](../assets/rpc-bridge.png)
```

### List Accessibility
- Use semantic HTML lists (`-`, `1.`) not text descriptions
- Don't rely on color alone to convey information

### Link Text
- Descriptive link text, not "click here"
- Accessible to screen readers

```markdown
❌ Click [here](#setup) to configure
✅ [Configure your bot](#setup)
```

---

## 12. Common Patterns

### "Getting Started" Page
```markdown
---
title: "Getting Started with X"
description: "Set up X in 5 minutes."
category: "Getting Started"
---

# Getting Started with X

## What You'll Learn
- Item 1
- Item 2
- Item 3

## Prerequisites
- Bun 1.3+
- Postgres installed

## Step 1: Setup
(Instructions)

## Step 2: Configure
(Instructions)

## Step 3: Verify
(How to check it's working)

## What's Next
[Next guide link]
```

### "Reference" Page
```markdown
---
title: "X Reference"
description: "Complete reference of all X options."
category: "Core Architecture"
---

# X Reference

## Overview
(What is X? When to use it?)

## Configuration
| Option | Type | Default | Purpose |
| ... | ... | ... | ... |

## Examples
(Realistic examples)

## See Also
[Related page links]
```

### "Troubleshooting" Section
```markdown
## Troubleshooting

### Issue: "Error message here"
**Cause**: Why this happens  
**Resolution**: Step-by-step fix

### Issue: "Another error"
**Cause**: Why  
**Resolution**: Fix
```

---

## 13. Review Checklist

Before submitting docs for review, verify:

- [ ] Frontmatter is valid YAML (title, description, category)
- [ ] H2 hierarchy used consistently (no H1, no H4+)
- [ ] All internal links work (test locally or on docs site)
- [ ] Code blocks have language tags
- [ ] Examples compile or are marked pseudocode
- [ ] Tables are readable (max 5 columns)
- [ ] Terminology matches this guide
- [ ] No hardcoded version numbers (or explicitly dated)
- [ ] At least one troubleshooting section (for operational docs)
- [ ] Images have alt text
- [ ] Passive voice minimized
- [ ] "We" and "us" avoided (use "you" or passive)
- [ ] Spell-checked and grammar-reviewed

---

## 14. Common Mistakes to Avoid

| Mistake | Fix |
| :--- | :--- |
| "This is an easy task" | Assume readers have varying expertise; explain thoroughly |
| Hardcoded version numbers | Use `v0.3.0+` or "latest" |
| No table of contents | Add for 5+ sections |
| Broken internal links | Test all cross-doc links |
| Inconsistent terminology | Use "guild" not "server", "addon" not "plugin" |
| No examples | Every how-to needs at least one example |
| Images without alt text | Screen readers need descriptions |
| Assume Discord knowledge | Link to Discord docs for unfamiliar concepts |
| Dense paragraphs | Use subheadings and lists |
| No next steps | Tell readers what to do after this page |

---

## 15. Maintenance & Updates

### Keeping Docs in Sync
- Update docs **in the same PR** as code changes
- Don't document features before they're shipped
- Flag deprecated content with:
  ```markdown
  > [!WARNING]
  > **Deprecated in v0.3.0**: Use [new way](../path) instead.
  ```

### Versioning Docs
- Reference stable versions (e.g., "v0.3.0+")
- Link to version-specific docs if needed
- Archive old versions separately

### Regular Audits
- Quarterly: Check for broken links
- Quarterly: Spot-check examples for accuracy
- Annually: Full content review for relevance

---

## 16. Tools & Resources

### Editors
- VS Code with Markdown All in One extension
- GitHub's web editor (for quick fixes)

### Validation
- Prettier (markdown formatting): `prettier --check docs/`
- MarkdownLint (style linting): check your editor
- Link checker: `npx markdown-link-check apps/docs/src/content/docs/**/*.md`

### Building Docs Locally
```bash
cd apps/docs
bun run dev
# Docs site available at http://localhost:3000
```

### Preview Changes
- Push to a branch, open PR
- GitHub renders markdown in PR previews
- Test links and formatting in the preview

---

## 17. Questions?

When in doubt:
1. Check existing docs for similar patterns
2. Read the "Terminology Reference Table" (§3)
3. Ask in the Discord or open a discussion

---

**Version History**:
- **1.0** (2026-09-03): Initial style guide for Wave 10
