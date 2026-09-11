"use client";

import { useState } from "react";
import type {
  MessageBlockButton,
  MessageBlockV2,
  MessageDocumentV2,
  SectionAccessory,
} from "@lumi/contracts";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Layers,
  Minus,
  Images,
  Plus,
  SquareMousePointer,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input, Textarea } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SendTestMessageButton } from "#/components/guild/send-test-message-button";
import {
  DiscordMessagePreview,
  type PreviewButton,
  type PreviewContainer,
  type PreviewV2Component,
} from "#/components/guild/discord-message-preview";
import { resolveTemplatePreview } from "#/components/guild/config-field-input";

const ButtonStyles: MessageBlockButton["style"][] = [
  "primary",
  "secondary",
  "success",
  "danger",
  "link",
];

function newId(): string {
  return Math.random().toString(36).slice(2);
}

function blankBlock(type: MessageBlockV2["type"]): MessageBlockV2 {
  switch (type) {
    case "section":
      return { id: newId(), type: "section", texts: [""] };
    case "mediaGallery":
      return { id: newId(), type: "mediaGallery", imageUrls: [""] };
    case "separator":
      return { id: newId(), type: "separator", size: "small", divider: true };
    case "actionRow":
      return { id: newId(), type: "actionRow", buttons: [] };
  }
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

const BlockIcons: Record<MessageBlockV2["type"], typeof Layers> = {
  section: Layers,
  mediaGallery: Images,
  separator: Minus,
  actionRow: SquareMousePointer,
};

const BlockTitles: Record<MessageBlockV2["type"], string> = {
  section: "Section",
  mediaGallery: "Media Gallery",
  separator: "Separator",
  actionRow: "Action Row",
};

/** Same-shape problems the real Discord API would reject the block for — surfaced
 * inline so an admin catches them before Save rather than from a failed send. */
function blockProblem(block: MessageBlockV2): string | null {
  switch (block.type) {
    case "section":
      if (!block.texts.some((t) => t.trim().length > 0)) {
        return "Needs at least one non-empty text.";
      }
      if (block.accessory?.type === "thumbnail" && block.accessory.url.trim().length === 0) {
        return "Thumbnail accessory needs a URL.";
      }
      return null;
    case "mediaGallery":
      return block.imageUrls.some((u) => u.trim().length > 0)
        ? null
        : "Needs at least one image URL.";
    case "separator":
      return null;
    case "actionRow": {
      if (block.buttons.length === 0) return "Must contain at least one button.";
      const badLink = block.buttons.find(
        (b) => b.style === "link" && (b.url ?? "").trim().length === 0,
      );
      return badLink ? "A link-style button needs a URL." : null;
    }
  }
}

function toPreviewButton(b: MessageBlockButton): PreviewButton {
  return { label: b.label || "Button", style: b.style, emoji: b.emoji };
}

export function blockToPreview(block: MessageBlockV2): PreviewV2Component {
  switch (block.type) {
    case "section":
      return {
        kind: "section",
        texts: block.texts.map((t) => resolveTemplatePreview(t || " ")),
        accessory:
          block.accessory?.type === "thumbnail"
            ? { type: "thumbnail", url: block.accessory.url }
            : block.accessory?.type === "button"
              ? { type: "button", button: toPreviewButton(block.accessory.button) }
              : undefined,
      };
    case "mediaGallery":
      return { kind: "media", imageUrls: block.imageUrls };
    case "separator":
      return { kind: "separator", divider: block.divider };
    case "actionRow":
      return { kind: "buttons", buttons: block.buttons.map(toPreviewButton) };
  }
}

function normalize(value: unknown): MessageDocumentV2 {
  if (typeof value !== "object" || value === null) return { blocks: [] };
  const v = value as Record<string, unknown>;
  const blocks = Array.isArray(v.blocks) ? (v.blocks as MessageBlockV2[]) : [];
  return {
    blocks,
    ...(typeof v.accentColor === "string" ? { accentColor: v.accentColor } : {}),
  };
}

/**
 * Visual editor for a `MessageDocumentV2` (Components V2 blocks): add /
 * remove / reorder Section, Media Gallery, Separator and Action Row blocks,
 * each with an inline editor, plus a live Discord-style preview reusing
 * `DiscordMessagePreview`'s Components V2 container rendering.
 */
export function MessageBuilderV2({
  value,
  onChange,
  templateVars = [],
  fieldLabel,
  saveAndTest,
  showPreview = true,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  templateVars?: string[];
  fieldLabel: string;
  saveAndTest?: { label: string; action: () => Promise<{ ok: boolean; error?: string }> };
  /** Set false when the surrounding form already renders its own preview
   * combining these blocks with other content (e.g. reaction-role menus,
   * where the options list and controls always get appended below) — two
   * previews of the same message on one page is just noise. */
  showPreview?: boolean;
}) {
  const doc = normalize(value);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function setDoc(next: MessageDocumentV2) {
    onChange(next);
  }

  function updateBlock(index: number, next: MessageBlockV2) {
    setDoc({ ...doc, blocks: doc.blocks.map((b, i) => (i === index ? next : b)) });
  }

  function removeBlock(index: number) {
    setDoc({ ...doc, blocks: doc.blocks.filter((_, i) => i !== index) });
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setDoc({ ...doc, blocks: move(doc.blocks, index, index + dir) });
  }

  function addBlock(type: MessageBlockV2["type"]) {
    setDoc({ ...doc, blocks: [...doc.blocks, blankBlock(type)] });
  }

  function duplicateBlock(index: number) {
    const source = doc.blocks[index];
    if (!source) return;
    const copy = { ...source, id: newId() };
    const next = [...doc.blocks];
    next.splice(index + 1, 0, copy);
    setDoc({ ...doc, blocks: next });
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const previewContainer: PreviewContainer = {
    accentColor: doc.accentColor,
    components: doc.blocks.map(blockToPreview),
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${fieldLabel} accent color`}
          value={/^#[0-9a-fA-F]{6}$/.test(doc.accentColor ?? "") ? doc.accentColor! : "#5865F2"}
          onChange={(e) => setDoc({ ...doc, accentColor: e.target.value })}
          className="size-8 shrink-0 cursor-pointer rounded-control border border-border bg-bg-subtle p-0.5"
        />
        <span className="text-[13px] text-fg-muted">Container accent color</span>
      </div>

      <div className="flex flex-col gap-2">
        {doc.blocks.map((block, i) => (
          <BlockEditor
            key={block.id}
            block={block}
            index={i}
            total={doc.blocks.length}
            templateVars={templateVars}
            collapsed={collapsed.has(block.id)}
            onChange={(next) => updateBlock(i, next)}
            onRemove={() => removeBlock(i)}
            onMove={(dir) => moveBlock(i, dir)}
            onDuplicate={() => duplicateBlock(i)}
            onToggleCollapsed={() => toggleCollapsed(block.id)}
          />
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm" className="w-fit">
            <Plus aria-hidden className="size-3.5" /> Add Component
            <ChevronDown aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(Object.keys(BlockTitles) as MessageBlockV2["type"][]).map((type) => {
            const Icon = BlockIcons[type];
            return (
              <DropdownMenuItem key={type} onSelect={() => addBlock(type)}>
                <Icon aria-hidden className="size-3.5" />
                {BlockTitles[type]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {showPreview ? (
        <DiscordMessagePreview channelName="preview" container={previewContainer} />
      ) : null}
      {saveAndTest ? (
        <SendTestMessageButton label={saveAndTest.label} action={saveAndTest.action} />
      ) : null}
    </div>
  );
}

function BlockEditor({
  block,
  index,
  total,
  templateVars,
  collapsed,
  onChange,
  onRemove,
  onMove,
  onDuplicate,
  onToggleCollapsed,
}: {
  block: MessageBlockV2;
  index: number;
  total: number;
  templateVars: string[];
  collapsed: boolean;
  onChange: (next: MessageBlockV2) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onToggleCollapsed: () => void;
}) {
  const Icon = BlockIcons[block.type];
  const problem = blockProblem(block);

  return (
    <div className="flex flex-col gap-2 rounded-panel border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <ChevronDown aria-hidden className="size-3.5 shrink-0" />
          )}
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {index + 1}. {BlockTitles[block.type]}
          </span>
          {problem ? <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-danger" /> : null}
        </button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Duplicate block"
            onClick={onDuplicate}
          >
            <Copy aria-hidden className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Move block up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Move block down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" aria-label="Remove block" onClick={onRemove}>
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      {problem ? (
        <p className="flex items-center gap-1.5 rounded-control bg-danger-soft px-2.5 py-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {problem}
        </p>
      ) : null}

      {collapsed ? null : block.type === "section" ? (
        <SectionEditor block={block} templateVars={templateVars} onChange={onChange} />
      ) : block.type === "mediaGallery" ? (
        <MediaGalleryEditor block={block} onChange={onChange} />
      ) : block.type === "separator" ? (
        <SeparatorEditor block={block} onChange={onChange} />
      ) : (
        <ActionRowEditor block={block} onChange={onChange} />
      )}
    </div>
  );
}

function SectionEditor({
  block,
  templateVars,
  onChange,
}: {
  block: Extract<MessageBlockV2, { type: "section" }>;
  templateVars: string[];
  onChange: (next: MessageBlockV2) => void;
}) {
  function setText(i: number, text: string) {
    onChange({ ...block, texts: block.texts.map((t, j) => (j === i ? text : t)) });
  }
  function addText() {
    if (block.texts.length >= 3) return;
    onChange({ ...block, texts: [...block.texts, ""] });
  }
  function removeText(i: number) {
    onChange({ ...block, texts: block.texts.filter((_, j) => j !== i) });
  }
  function setAccessory(accessory: SectionAccessory | undefined) {
    onChange({ ...block, accessory });
  }

  return (
    <div className="flex flex-col gap-2">
      {block.texts.map((text, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <Textarea
            rows={2}
            aria-label={`Text ${i + 1}`}
            value={text}
            onChange={(e) => setText(i, e.target.value)}
            className="flex-1"
          />
          {block.texts.length > 1 ? (
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove text ${i + 1}`} onClick={() => removeText(i)}>
              <X aria-hidden className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
      {block.texts.length < 3 ? (
        <Button type="button" variant="ghost" size="sm" onClick={addText} className="self-start">
          <Plus aria-hidden className="size-3.5" /> Add text
        </Button>
      ) : null}
      {templateVars.length > 0 ? (
        <p className="text-[12px] text-fg-subtle">
          Placeholders: {templateVars.map((v) => `{${v}}`).join(", ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t border-border pt-2">
        <span className="text-[13px] text-fg-muted">Accessory</span>
        <Select
          aria-label="Accessory type"
          className="max-w-48"
          value={block.accessory?.type ?? ""}
          onValueChange={(next) => {
            if (next === "thumbnail") setAccessory({ type: "thumbnail", url: "" });
            else if (next === "button")
              setAccessory({ type: "button", button: { style: "primary", label: "Button" } });
            else setAccessory(undefined);
          }}
          options={[
            { value: "", label: "None" },
            { value: "thumbnail", label: "Thumbnail image" },
            { value: "button", label: "Button" },
          ]}
        />
        {block.accessory?.type === "thumbnail" ? (
          <Input
            type="text"
            placeholder="https://…"
            aria-label="Thumbnail URL"
            value={block.accessory.url}
            onChange={(e) => setAccessory({ type: "thumbnail", url: e.target.value })}
          />
        ) : block.accessory?.type === "button" ? (
          <ButtonFields
            button={block.accessory.button}
            onChange={(button) => setAccessory({ type: "button", button })}
          />
        ) : null}
      </div>
    </div>
  );
}

function MediaGalleryEditor({
  block,
  onChange,
}: {
  block: Extract<MessageBlockV2, { type: "mediaGallery" }>;
  onChange: (next: MessageBlockV2) => void;
}) {
  function setUrl(i: number, url: string) {
    onChange({ ...block, imageUrls: block.imageUrls.map((u, j) => (j === i ? url : u)) });
  }
  function addUrl() {
    if (block.imageUrls.length >= 10) return;
    onChange({ ...block, imageUrls: [...block.imageUrls, ""] });
  }
  function removeUrl(i: number) {
    onChange({ ...block, imageUrls: block.imageUrls.filter((_, j) => j !== i) });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {block.imageUrls.map((url, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            type="text"
            placeholder="https://…"
            aria-label={`Image URL ${i + 1}`}
            value={url}
            onChange={(e) => setUrl(i, e.target.value)}
            className="flex-1 font-mono text-[13px]"
          />
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove image ${i + 1}`} onClick={() => removeUrl(i)}>
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      ))}
      {block.imageUrls.length < 10 ? (
        <Button type="button" variant="ghost" size="sm" onClick={addUrl} className="self-start">
          <Plus aria-hidden className="size-3.5" /> Add image ({block.imageUrls.length}/10)
        </Button>
      ) : null}
    </div>
  );
}

function SeparatorEditor({
  block,
  onChange,
}: {
  block: Extract<MessageBlockV2, { type: "separator" }>;
  onChange: (next: MessageBlockV2) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <Select
        aria-label="Separator size"
        className="max-w-40"
        value={block.size}
        onValueChange={(next) => onChange({ ...block, size: next === "large" ? "large" : "small" })}
        options={[
          { value: "small", label: "Small spacing" },
          { value: "large", label: "Large spacing" },
        ]}
      />
      <label className="flex items-center gap-1.5 text-[13px]">
        <input
          type="checkbox"
          checked={block.divider}
          onChange={(e) => onChange({ ...block, divider: e.target.checked })}
        />
        Show divider line
      </label>
    </div>
  );
}

function ActionRowEditor({
  block,
  onChange,
}: {
  block: Extract<MessageBlockV2, { type: "actionRow" }>;
  onChange: (next: MessageBlockV2) => void;
}) {
  function setButton(i: number, button: MessageBlockButton) {
    onChange({ ...block, buttons: block.buttons.map((b, j) => (j === i ? button : b)) });
  }
  function addButton() {
    if (block.buttons.length >= 5) return;
    onChange({ ...block, buttons: [...block.buttons, { style: "primary", label: "Button" }] });
  }
  function removeButton(i: number) {
    onChange({ ...block, buttons: block.buttons.filter((_, j) => j !== i) });
  }

  return (
    <div className="flex flex-col gap-2">
      {block.buttons.map((button, i) => (
        <div key={i} className="flex items-start gap-1.5 rounded-control border border-border p-2">
          <div className="flex-1">
            <ButtonFields button={button} onChange={(next) => setButton(i, next)} />
          </div>
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove button ${i + 1}`} onClick={() => removeButton(i)}>
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      ))}
      {block.buttons.length < 5 ? (
        <Button type="button" variant="ghost" size="sm" onClick={addButton} className="self-start">
          <Plus aria-hidden className="size-3.5" /> Add button ({block.buttons.length}/5)
        </Button>
      ) : null}
    </div>
  );
}

function ButtonFields({
  button,
  onChange,
}: {
  button: MessageBlockButton;
  onChange: (next: MessageBlockButton) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          aria-label="Button style"
          className="max-w-36"
          value={button.style}
          onValueChange={(next) => onChange({ ...button, style: ButtonStyles.includes(next as MessageBlockButton["style"]) ? (next as MessageBlockButton["style"]) : "primary" })}
          options={ButtonStyles.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))}
        />
        <Input
          type="text"
          placeholder="Label"
          aria-label="Button label"
          value={button.label}
          onChange={(e) => onChange({ ...button, label: e.target.value })}
          className="max-w-40"
        />
        <Input
          type="text"
          placeholder="Emoji (optional)"
          aria-label="Button emoji"
          value={button.emoji ?? ""}
          onChange={(e) => onChange({ ...button, emoji: e.target.value })}
          className="max-w-32"
        />
      </div>
      {button.style === "link" ? (
        <Input
          type="text"
          placeholder="https://…"
          aria-label="Button URL"
          value={button.url ?? ""}
          onChange={(e) => onChange({ ...button, url: e.target.value })}
          className="font-mono text-[13px]"
        />
      ) : (
        <Input
          type="text"
          placeholder="custom_id (for a future bot handler)"
          aria-label="Button custom ID"
          value={button.customId ?? ""}
          onChange={(e) => onChange({ ...button, customId: e.target.value })}
          className="font-mono text-[13px]"
        />
      )}
    </div>
  );
}
