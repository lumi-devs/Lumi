---
"@lumi/core": patch
---

Route interactions by component kind as well as customId prefix. Handlers sharing one exact prefix (config panel buttons/selects on `cfg`, tempvc panel buttons/selects/modals) previously collapsed to the first registered, so every select and modal on those prefixes was silently swallowed. Affected handlers now declare `kinds`.
