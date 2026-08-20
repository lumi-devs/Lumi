---
title: "What Lumi does"
description: "The nine built-in features, and how the security tools actually work."
---

Lumi ships with nine features built in. Everything's on by default except Core, which can't be turned off - it's the bot itself. Turn any of the others on or off per-server from `/lumi panel` → **Modules**.

| Feature | What it's for |
| :--- | :--- |
| **Core** | Help, about, module toggles, the config panel, permissions, the addon hub. Always on. |
| **Moderation** | Warn, mute, kick, ban, timeout, quarantine - with case logs and warnings that fade over time. |
| **Filter** | Blocks banned words, spam links, invite links, mention spam, and excessive caps, automatically. |
| **Security** | Anti-raid and anti-nuke protection - see below, this one's worth understanding properly. |
| **Logging** | A record of who joined, left, got banned, edited a message, changed a nickname - the stuff you want a paper trail for. |
| **AFK** | Set yourself away; anyone who mentions you gets told, and your nickname gets an `[AFK]` tag. |
| **Temp Voice Channels** | Members spin up their own voice channel on demand, and it disappears once everyone leaves. |
| **Utility** | General-purpose commands. |
| **Dashboard** | Lets the web dashboard talk to the bot. Turning this off only affects the dashboard - everything else keeps working. |

## The security suite

This is where Lumi earns its keep. Four things work together here: anti-nuke, the join gate, panic mode, and automatic backups.

### Anti-nuke: stopping a raid before it finishes

Lumi watches the server's audit log for the kind of thing a compromised admin account or a malicious bot does - mass bans, mass kicks, deleting channels or roles, creating webhooks. If one person does too many of those too quickly, Lumi steps in before they can finish.

You choose how aggressive the response is per action type: log it and move on, quarantine the person (strip their roles, drop them in a holding area), or ban them outright. The server owner, the bot itself, anyone with a trusted role, and staff with an enforced permission are always exempt - enforced permissions are the one thing that survives quarantine, so you can't accidentally lock out the people who are supposed to fix the problem.

This needs Discord's audit-log permission enabled for the bot to see what's happening.

### Join gate & verification: keeping raids and bots out

Before someone even gets a chance to cause trouble, Lumi can check them at the door:

- **New accounts** - flag or kick accounts younger than an age you set.
- **Raid detection** - if too many people join in too short a window, Lumi treats it as a raid and switches every new joiner to a stricter response (kick, timeout, or quarantine) until things calm down.
- **Verification** - `/verifypanel` posts a button that shows new members a short sequence of emoji to click in order. It's not a real CAPTCHA and won't stop someone determined to get through manually, but it stops the simple join-and-spam bots cold. Members who don't finish in time can be automatically kicked.
- **Join filters** - independent checks you can turn on individually: no avatar set, an unverified bot account, a username that matches a pattern you define, or a display name that's obviously an ad (a link or invite baked into the name itself). Each one gets its own response.

### Panic mode: the "something is actively going wrong" button

`/panic` locks the server down in one command - mutes `@everyone` across your text channels and pauses invites, so nothing new can happen while you figure out what's going on. It asks you to confirm first (20 seconds, cancels itself if you don't answer), and it remembers exactly how every channel was set up beforehand.

When you're ready, hit **Revert** on the resulting message and everything goes back to exactly how it was - permissions, invites, all of it - in one click.

### Backup & restore

While anti-nuke is on, Lumi takes an hourly snapshot of your server's structure - every role, every channel, permissions, ordering, all of it. Wick calls this "imaging," if that's the term you've heard before.

If the worst happens and someone guts your server anyway, `/restore` rebuilds it from the most recent snapshot. A panic-mode revert can also pull from this automatically.

### Filter that remembers

The word/link filter doesn't just react to one bad message - it keeps a running "heat" score per member that goes up with rule-breaking and cools down over time on its own. Cross a threshold and the punishment escalates automatically, so a repeat offender gets caught even if no single message would have triggered anything on its own.

## Data and privacy

If someone asks Lumi to delete their data, it goes through every feature that's currently loaded and asks each one to remove what it's stored about that person, then clears the shared records too. Most of the built-in features support this; a couple don't implement it yet, so it isn't airtight across every corner of the bot, but it's a real deletion, not a token gesture.
