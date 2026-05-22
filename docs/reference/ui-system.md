# Modern UI: Components V2

Ember has moved beyond traditional Discord Embeds, embracing the **Components V2** philosophy. This system leverages Discord's modern layout primitives—`ContainerBuilder`, `TextDisplayBuilder`, and `SeparatorBuilder`—to create interfaces that feel like native application views rather than "chat bubbles."

## The Philosophy of `src/utilities/cards.ts`

The project mandates a strict **"Never `new EmbedBuilder()`"** policy. Traditional embeds are treated as legacy technology. Instead, all UI is constructed using the factories in `src/utilities/cards.ts`.

### Why Components V2?

1.  **Visual Consistency:** By using centralized factories (`makeSuccessCard`, `makeErrorCard`), the bot maintains a unified visual language (colors, spacing, typography) across every module.
2.  **Modern Layouts:** `ContainerBuilder` allows for complex layouts that include headers, dividers, and structured text displays that traditional embeds cannot replicate.
3.  **Future Proofing:** Discord is increasingly moving away from markdown-heavy embeds in favor of structured components. Ember is built on this future state.

## Core Builders

The UI system is built on top of `discord.js` builders, wrapped for the Ember design system:

- **`ContainerBuilder`**: The root component for all modern cards. It acts as the canvas for the message.
- **`TextDisplayBuilder`**: Used for headers (H2 style) and body text. It supports structured content without the limitations of embed description fields.
- **`SeparatorBuilder`**: Provides semantic spacing and visual dividers (lines). This is used to separate headers from bodies and to create logical sections within a single card.

## Interaction Flow

Every card factory returns a `CardReply` object, which is a pre-structured object ready to be spread into a Discord interaction reply:

```typescript
const card = makeSuccessCard('Settings Updated', 'Your changes have been saved to the database.');
await interaction.reply({ ...card, ephemeral: true });
```

### Ephemeral Handling

Because Components V2 uses specialized flags (`MessageFlags.IsComponentsV2`), standard ephemeral handling can sometimes clobber UI rendering. Ember provides an `ephemeralCard()` utility that safely merges the `Ephemeral` flag with the necessary `IsComponentsV2` state.

## UI Factories

| Factory | Use Case |
| :--- | :--- |
| `makeSuccessCard` | Confirming successful actions (Green accent). |
| `makeErrorCard` | Reporting failures or permission issues (Red accent). |
| `makeWarningCard` | Cautionary messages that don't stop execution (Yellow accent). |
| `makeListCard` | Paged lists of items (e.g., config values, member lists) with built-in pagination buttons. |
