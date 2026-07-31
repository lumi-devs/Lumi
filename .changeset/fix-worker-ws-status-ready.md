---
"@lumi/core": patch
---

Report gateway-less worker `client.ws.status` as READY so discord.js and Sapphire treat bus-driven workers as connected in distributed mode.
