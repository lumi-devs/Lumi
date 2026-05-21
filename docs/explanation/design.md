# Ember Design Language

## 🎨 The Aesthetic Vision

Ember follows a strict, high-end design philosophy known as the **Ember Design Language (EDL)**. This language is built on three core palettes that define the emotional state of the interface: **Sakura**, **Lavender**, and **Mint**.

### **The Three Palettes**

| Palette | Color Hex | Use Case | Emotion |
| :--- | :--- | :--- | :--- |
| 🌸 **Sakura** | `#FFB7C5` | Error states, critical alerts | Urgent, but refined |
| 🪻 **Lavender** | `#E6E6FA` | Primary interactions, neutral info | Calm, sophisticated |
| 🌿 **Mint** | `#B2FBDA` | Success states, completions | Fresh, rewarding |

---

## 🏗️ Beyond the Embed: Components V2

In the "Inferno" iteration of Ember, we have officially deprecated the use of standard `EmbedBuilder`. While embeds served the community for years, they are limited in layout and interactive potential.

Ember utilizes **Discord Components V2** primitives, primarily through our internal `ContainerBuilder` and `TextDisplayBuilder` factories.

### **Why Components V2?**

1.  **Layout Precision:** Unlike embeds, which follow a rigid vertical structure, Components V2 allow for modular, grouped information blocks that feel like a native app.
2.  **High Contrast:** By utilizing specialized text display builders, we achieve a level of visual clarity and contrast that standard embeds lack.
3.  **Interactive Fluidity:** Every UI element in Ember is designed with an interaction-first mindset. Buttons, selects, and modals are first-class citizens in our layout engine.

---

## 📐 UI Principles

### **1. Vertical Rhythm**
Information must flow with a consistent vertical rhythm. Use standardized spacing between blocks to prevent visual clutter.

### **2. Minimalist Decoration**
We avoid "emoji soup." Icons are used sparingly and purposefully to anchor the eye to key actions or data points.

### **3. The 'Elite' Filter**
Every interface must pass the 'Elite' filter:
- Is it readable in under 2 seconds?
- Does the color palette accurately reflect the status?
- Is there a clear primary action for the user?

---

## 🛠️ Implementation

To maintain consistency, developers **must** use the UI factories provided in `src/lib/cards.ts`. Direct instantiation of Discord builders is forbidden to ensure that the Ember Design Language remains pure across all modules.

```typescript
// Example: Creating a success card with the Mint palette
const card = makeSuccessCard({
  title: 'Action Complete',
  description: 'The operation was successful.'
});
```

---

> "Design is not just what it looks like and feels like. Design is how it works." — *The EDL Manifesto*
