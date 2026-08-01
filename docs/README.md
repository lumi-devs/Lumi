# 📚 Lumi Documentation Hub

Welcome to the engineering documentation for **Lumi** - a modular, self-hosted Discord bot framework built with TypeScript and Bun.

---

## 🧭 Navigation & Guides

| Document | Description |
| :--- | :--- |
| 🏗️ [**Architecture & System Topology**](architecture.md) | The two process roles (`worker`, `scheduler`), horizontal shard-range scaling, RPC transport, and database layer |
| ⚙️ [**Configuration Reference**](configuration.md) | Complete list of environment variables, Docker Compose profiles, and Kubernetes manifests |
| 🧩 [**Modules & Features**](modules.md) | Overview of built-in modules (`core`, `mod`, `filter`, `utility`, `afk`, `tempvc`, `logging`, `dashboard`) and CLI tools |
| 🛠️ [**Module Creation Guide**](GUIDE_MODULE_CREATION.md) | Step-by-step tutorial for building new feature modules, commands, listeners, services, and tasks |
| 🤝 [**Contributing Guide**](../CONTRIBUTING.md) | Coding standards, workflow, pull request guidelines, and setup |
| 🔒 [**Security Policy**](../SECURITY.md) | Responsible disclosure, vulnerability reporting, and addon security guidelines |
| 🤖 [**AI & Agent Blueprint**](../AGENTS.md) | Agent operational protocols, monorepo boundaries, path aliases, and anti-pattern rules |

---

## 📦 Workspace Packages & Apps

- **[Apps Overview](../apps/worker/README.md)**: Entrypoints for the runtime roles
  - [`apps/worker`](../apps/worker/README.md): Discord gateway connection & command execution engine
  - [`apps/scheduler`](../apps/scheduler/README.md): BullMQ task queue processor
  - [`apps/dashboard`](../apps/dashboard/README.md): Web management panel
- **[Packages Overview](../packages/core/README.md)**: Shared libraries & core framework
  - [`packages/core`](../packages/core/README.md): Framework core, module loader, & database service
  - [`packages/event-bus`](../packages/event-bus/README.md): Task queue & RPC messaging abstractions
  - [`packages/sharding`](../packages/sharding/README.md): Shard planner, cluster coordinator & session store
  - [`packages/observability`](../packages/observability/README.md): Prometheus & OpenTelemetry instrumentation
  - [`packages/contracts`](../packages/contracts/README.md): RPC schemas & type definitions

---

## 🚀 Quick Links

- [GitHub Repository](https://github.com/lumi-devs/Lumi)
- [Issue Tracker](https://github.com/lumi-devs/Lumi/issues)
- [Discussions](https://github.com/lumi-devs/Lumi/discussions)
- [Security Advisories](https://github.com/lumi-devs/Lumi/security/advisories)
