# Cards & UI

All user-facing responses use the card factory in `src/lib/util/cards.ts`.
**Never use `new EmbedBuilder()` directly in a command.** Import a factory.

---

## Quick Reply (via EmberCommand helpers)

```typescript
// Auto-detects deferred vs non-deferred; all ephemeral by default
await this.replySuccess(interaction, '✅ Done', 'Operation completed.');
await this.replyError(interaction, '❌ Error', 'Something went wrong.');
await this.replyWarning(interaction, '⚠️ Heads up', 'This will be permanent.');
await this.replyInfo(interaction, 'ℹ️ Info', 'Here is what I found.');

// Public (non-ephemeral)
await this.replySuccess(interaction, '✅ Done', 'Announced!', { ephemeral: false });
```

---

## Direct Card Factories

```typescript
import { makeSuccessCard, makeErrorCard, makeWarningCard, makeInfoCard, makeListCard, makeConfirmCard } from '#lib/util/cards.js';

// Spread directly into interaction.reply() / followUp()
await interaction.reply({ ...makeSuccessCard('Done', 'Role created.'), ephemeral: true });

// With options
await interaction.reply({
  ...makeInfoCard('Results', 'Found 5 items', {
    footer: '5 items',
    timestamp: true,
  }),
  ephemeral: true,
});

// Fields card (key/value pairs)
await interaction.followUp({
  ...makeFieldsCard('Guild Config', [
    { name: 'Mod Role', value: '<@&123>', inline: true },
    { name: 'Enabled', value: 'Yes', inline: true },
  ]),
  ephemeral: true,
});
```

---

## Confirm Dialog

```typescript
import { makeConfirmCard } from '#lib/util/cards.js';

// 1. Send the confirm card
await interaction.reply({
  ...makeConfirmCard('Delete case #42?', 'This cannot be undone.', `confirm-case:${caseId}`),
  ephemeral: true,
});

// 2. Handle button in an InteractionHandler
// src/interaction-handlers/confirmCase.ts
export class ConfirmCaseHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('confirm-case:')) return this.none();
    const [, caseId] = interaction.customId.split(':');
    return this.some({ caseId, confirmed: !interaction.customId.includes('cancel') });
  }

  public async run(interaction: ButtonInteraction, { caseId, confirmed }: ParseResult) {
    await interaction.deferUpdate();
    if (!confirmed) {
      return interaction.editReply({ ...makeInfoCard('Cancelled', 'No changes made.'), components: [] });
    }
    await deleteCase(caseId);
    return interaction.editReply({ ...makeSuccessCard('Deleted', `Case #${caseId} removed.`), components: [] });
  }
}
```

---

## Paginated List

```typescript
import { makeListCard } from '#lib/util/cards.js';

// Simple single-page
await interaction.reply({ ...makeListCard('Birthdays', items), ephemeral: true });

// Multi-page with navigation buttons
await interaction.reply({
  ...makeListCard('Birthdays', items, page, 10, `birthday-list:${interaction.user.id}`),
  ephemeral: true,
});
// Handle prev/next in an InteractionHandler keyed on 'birthday-list:'
```

---

## Colors Reference

```typescript
import { EmberColors } from '#core/branding.js';

EmberColors.SUCCESS  // 0x57F287  green
EmberColors.ERROR    // 0xED4245  red
EmberColors.WARNING  // 0xFEE75C  yellow
EmberColors.INFO     // 0x5865F2  blurple
EmberColors.PRIMARY  // 0x5865F2  blurple
EmberColors.NEUTRAL  // 0x4F545C  grey
```

---

## Rules

- **Never `new EmbedBuilder()`** in a command or listener — always use a factory
- **Always `ephemeral: true`** for error/warning cards
- **Confirm dialogs** always use an `InteractionHandler` — never `awaitMessageComponent` (blocks the thread)
- **Custom ID format**: `{purpose}:{dataTokens}` — the `InteractionHandler.parse()` filters on the prefix
- **`CardReply` type** spreads into `interaction.reply()` and `interaction.followUp()` directly
- **`interaction.deferReply({ ephemeral: true })`** at the top of slow commands — then `followUp()`
