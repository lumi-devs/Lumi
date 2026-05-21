<div align="center">
  <img src="https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?auto=format&fit=crop&w=1200&h=400&q=80" width="100%" alt="Ember Banner" />

  # 🔥 Ember

  ### **The Next Generation of Modular Discord Intelligence**

  [![Bun](https://img.shields.io/badge/Runtime-Bun%201.1-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
  [![Sapphire](https://img.shields.io/badge/Framework-Sapphire%20v5-24bdf3?style=for-the-badge&logo=sapphire&logoColor=white)](https://www.sapphirejs.dev/)
  [![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Prisma](https://img.shields.io/badge/Database-Prisma%207-2d3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
  [![RabbitMQ](https://img.shields.io/badge/Messaging-RabbitMQ-ff6600?style=for-the-badge&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
  [![Redis](https://img.shields.io/badge/Cache-Redis-dc382d?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)

  **Modular by Design. Performance by Default. Elite by Nature.**
</div>

---

## 🌟 The Vision

Ember is not just another Discord bot. It is a **hyper-modular engine** built for the modern era of the Discord API. Leveraging the raw speed of **Bun**, the structural elegance of **Sapphire v5**, and a state-of-the-art **Messaging Fabric**, Ember provides a foundation for bots that need to scale, evolve, and perform with zero compromise.

> "To build for the future, one must first master the fire of the present." — *The Ember Collective*

---

## 🏛️ The Three Pillars

### 1. **Modular Autonomy**
Every feature in Ember is a first-class citizen. Our strict **Feature-Based Modularity** ensures that every module (AFK, Raids, Moderation) is an isolated island of logic. This isolation prevents technical debt and allows for rapid iteration without ripple effects.

### 2. **Visual Sophistication**
We've moved beyond the "embed era." Ember utilizes **Discord Components V2**, leveraging `ContainerBuilder` and `TextDisplayBuilder` to create rich, interactive, and high-contrast user interfaces that feel like native applications within Discord.

### 3. **Messaging Fabric**
A hybrid **Redis & RabbitMQ** architecture powers Ember's internal communication. Redis handles the high-speed RPC bridge for dashboard synchronization, while RabbitMQ manages the resilient event bus and job queue, ensuring no task is ever lost.

---

## 🛠️ Tech Stack

- **Runtime:** [Bun](https://bun.sh) — Direct TypeScript execution with ultra-fast startup and memory efficiency.
- **Framework:** [Sapphire Framework v5](https://www.sapphirejs.dev/) — The industry standard for robust, piece-based Discord bot development.
- **UI Architecture:** Discord Components V2 — Modern, fluid interfaces built via specialized UI factories.
- **Persistence:** [Prisma 7](https://www.prisma.io/) — Type-safe database access with a Postgres backbone.
- **Communication:** Redis (RPC/Caching) + RabbitMQ (Job Queue/Event Bus).

---

## 📖 Documentation

Explore the depths of Ember's architecture and philosophy:

### **Explanation**
- [**The Ember Story**](./docs/explanation/story.md) — The lore and vision behind the project.
- [**Design Language**](./docs/explanation/design.md) — Understanding Sakura, Lavender, and Mint palettes.

### **Reference**
- [**Modularity Protocol**](./docs/reference/modularity.md) — How features are isolated and scaled.
- [**UI System**](./docs/reference/ui-system.md) — Deep dive into Component V2 factories.
- [**Messaging Architecture**](./docs/reference/messaging.md) — The Redis & RabbitMQ hybrid system.

---

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env

# Generate Prisma client
bun run db:generate

# Start the fire
bun run dev
```

<div align="center">
  <p>Built with ❤️ by the Ember Team.</p>
</div>
