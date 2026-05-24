# ember-wizard

Architect-mode development guidance for Ember features, bug fixes, and refactoring. Applies systematic planning, Ember-first patterns, adversarial self-review, and quality gates. Use when implementing features, fixing bugs, or making multi-file changes that require careful planning.

---

## 1. Core Identity

**Think Systemically, Not Locally**
- Don't ask "How do I fix this bug?" Ask "Why does this bug exist? What systemic issue allowed it? Where else does this pattern appear?"
- Map the entire subsystem: What other methods touch this data? What are all the concurrent access paths? What invariants must hold across ALL of them?

**Quality Over Velocity** — A senior architect spends 70% understanding and 30% coding.

**Be Your Own Adversary** — Before committing ANY code, attack it:
- "What happens if this runs twice concurrently?"
- "What if this field is null? Zero? Negative?"
- "What assumptions am I making that could be wrong?"
- "What invariants must hold? How would I break them?"

---

## 2. Phase-Based Workflow

### Phase 1: Planning

1. Read `AGENTS.md` thoroughly
2. Load relevant Ember skills (ember-sapphire-patterns, ember-module-system, ember-config-system, etc.)
3. Create a todo list with phases
4. Assess task complexity:
   - **Simple**: Single file, obvious fix, < 50 lines
   - **Medium**: 2-3 files, clear scope
   - **Complex**: 4+ files, architectural impact, module creation

### Phase 2: Exploration

1. Search for similar implementations — methods, patterns, conventions
2. Verify all references exist — NEVER assume
3. Identify patterns to follow:
   - Existing command structure (EmberSubcommand vs Command)
   - Existing card factory usage
   - Existing data access patterns
   - Existing interaction handler patterns
4. List files to modify

### Phase 3: Implementation

Always follow Ember's non-negotiable conventions:

| Rule | File / Pattern |
|---|---|
| Never `new EmbedBuilder()` | Use `makeSuccessCard`, `makeErrorCard`, `makeListCard` from `#utilities/cards.js` |
| Never hard-code Redis keys | Use `RedisKeys.*` from `src/database/redis.ts` |
| Never `awaitMessageComponent()` | Use `InteractionHandler` piece |
| Throw errors, never send them | Global listeners catch and render error cards |
| Slash commands in groups | `/foo bar`, never `/foo_bar` |
| No cross-module imports | Module data stays in module |
| Module-specific utilities stay in module | Don't pollute `src/utilities/` |

### Phase 4: Verification

1. `bun run lint` — ESLint must pass
2. `bun run typecheck` — tsc must pass
3. Run relevant tests — `bun run test` or specific file
4. No regressions allowed

### Phase 5: Pre-Commit Review

**Self-Review Checklist:**
- [ ] All acceptance criteria addressed
- [ ] No hard-coded values that should be constants/RedisKeys
- [ ] All references verified with grep (never assumed)
- [ ] All edge cases handled (null, empty, zero, missing guild, missing user)
- [ ] Error handling uses thrown errors, not sent messages
- [ ] UI uses card factories, not raw EmbedBuilder
- [ ] Tests cover new functionality
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] No cross-module imports introduced

---

## 3. Ember-Specific Patterns Reference

### Commands

```typescript
@ApplyOptions<Command.Options>({
    name: 'foo',
    description: 'Does something'
})
export class FooCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName('foo')
                .setDescription('Does something')
                .addSubcommand((sub) => sub.setName('bar').setDescription('Sub-action'))
        );
    }

    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const guildId = interaction.guildId!;
        throw new Error('Not implemented'); // Errors auto-render as error cards
    }
}
```

### Subcommands (grouped — `/foo bar` never `/foo_bar`)

```typescript
@ApplyOptions<Subcommand.Options>({
    name: 'foo',
    subcommands: [
        { name: 'bar', chatInputRun: 'chatInputBar', default: true },
        { name: 'baz', chatInputRun: 'chatInputBaz' }
    ]
})
export class FooCommand extends EmberSubcommand {
    public async chatInputBar(interaction: Subcommand.ChatInputCommandInteraction) { }
    public async chatInputBaz(interaction: Subcommand.ChatInputCommandInteraction) { }
}
```

### Interaction Handlers (never awaitMessageComponent)

```typescript
@ApplyOptions<InteractionHandler.Options>({
    interactionHandlerType: InteractionHandlerTypes.Button
})
export class FooHandler extends InteractionHandler {
    public override async run(interaction: ButtonInteraction, parsed: ParsedData) { }
}
```

### Data Access

- Modules access `container.prisma` and `container.redis` directly in `src/modules/<name>/data.ts`
- Never route module data through `DatabaseService`
- Use `container.db` for shared config/settings access

### Cards UI

```typescript
import { makeSuccessCard, makeErrorCard, makeListCard } from '#utilities/cards.js';

const card = makeSuccessCard('Done!', 'Operation completed.');
await interaction.reply(card);
```

### Config System

- Config fields defined in `@EmberModule({ configFields: [...] })`
- Guild-specific config stored in module config storage
- `/config` command auto-generated for bool fields

---

## 4. Adversarial Questions

Before committing, ask:

1. **What if this runs twice concurrently?** — Is there a race? Need AsyncQueue or atomic DB update?
2. **What if guildId is null?** — Early return if `!interaction.guildId`
3. **What if the Discord API returns an error?** — Is there proper error handling?
4. **What if Redis is down?** — Does the code degrade gracefully?
5. **What if the user doesn't exist in the DB?** — Null checks?
6. **What assumptions am I making about data shape?** — Verify with types and runtime checks
7. **Am I following the pattern of existing similar pieces?** — Grep for examples first

---

## 5. Verification Commands

```bash
bun run lint          # ESLint (must pass)
bun run typecheck     # tsc (must pass)
bun run test          # vitest
bun run dev           # Start dev server
```

---

## 6. Test Strategy by Change Type

| Change Type | Strategy |
|---|---|
| Single file fix, < 20 lines | Related test class only |
| Single file, 20-50 lines | Related tests + quick sanity |
| New command/handler | Unit test for that piece |
| New module | Full module test suite |
| Database/schema changes | All affected test modules |
| Cross-cutting changes | All affected modules |

---

## 7. Summary Output

After completing, provide:
1. **What was built** — Brief description
2. **Files modified** — List
3. **Verification** — lint, typecheck, test results
4. **Next steps** — Any follow-up work
