# AFK System Guide

The AFK (Away From Keyboard) module provides an elegant, non-intrusive way to let your server know when you're busy. Built with Ember's **Executive-Class UI components**, it avoids bulky traditional embeds in favor of sleek, modern Discord container components that feel native and refined.

## Setting Your Status

You can set your AFK status in two ways, both designed for speed and clarity:

- **Slash Command:** Use `/afk [reason]` for a private, ephemeral confirmation that only you can see.
- **Message Command:** Simply type `afk [reason]` in chat. Ember will automatically delete your message to keep chat clean and post a temporary confirmation that vanishes after 20 seconds.

### The Look

When you set your status, Ember responds with a pristine UI container:
- **No Clunky Sidebars:** The colored accent bar is intentionally removed for a cleaner aesthetic.
- **Markdown Headers:** A crisp `## ✅ AFK Set` header communicates status instantly.
- **Smart Nicknames:** If configured, your server nickname will elegantly update to prepend `[AFK] `, letting everyone see your status at a glance across the user list and chat.

## While You're Away

Ember handles mentions with care so you never miss important context, while ensuring chat isn't flooded with bot replies.

- **Polite Notifications:** When someone mentions you, Ember replies to them with a beautifully styled gold container (`## 💤 [Name] is AFK`), showing your reason and how long you've been gone.
- **Anti-Spam Cooldowns:** To prevent chat clutter, mention notifications are rate-limited per channel. Additionally, these alerts self-delete after 10 minutes.
- **Invisible Tracking:** Every time you're mentioned, Ember silently records the author, channel, and timestamp in the background.

## Returning to the Server

The moment you send a new message in the server, your AFK status is automatically removed. 

- **Welcome Back Card:** Ember greets you with a `## 👋 Welcome Back!` container detailing exactly how long you were gone. This card self-cleans after 20 seconds to keep your workspace tidy.
- **Automatic Nickname Restoration:** Your `[AFK] ` nickname prefix is instantly and seamlessly removed.
- **Mentions Inbox:** If you were mentioned while away, your Welcome Back card includes a sleek, secondary button: `📬 View Mentions (N)`.

### The Executive Mentions Inbox

Clicking the `View Mentions` button opens an ephemeral, private inbox specifically for you.

- **Paginated View:** If you have many mentions, the inbox includes clean `◀ Prev` and `Next ▶` navigation buttons.
- **Rich Context:** Each entry displays exactly who mentioned you and how long ago (e.g., `2 hours ago`).
- **Direct Jump Links:** Every mention includes a `[Jump]` link that takes you straight to the message where you were pinged, completely eliminating the need to scroll back through chat history.
- **Clean Footers:** A subtle markdown footer (`-# Page 1/2 · 12 mentions · most recent first`) rounds out the design.

## Administrative Tools

For server owners, the AFK module provides a few handy tools:
- `afklist`: Displays a scrollable card showing everyone currently AFK in the server and their durations.
- `afkstats`: A quick analytics card showing active AFK entries and system cooldown metrics.
- `afkclean`: A utility to forcefully remove AFK statuses for members who have left the server.
