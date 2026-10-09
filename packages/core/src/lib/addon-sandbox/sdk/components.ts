import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";

export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
  Link: 5,
} as const;

export type ButtonStyleValue = (typeof ButtonStyle)[keyof typeof ButtonStyle];

export interface ActionButtonSpec {
  customId: string;
  label: string;
  style?: ButtonStyleValue | "primary" | "secondary" | "success" | "danger";
  emoji?: string;
  disabled?: boolean;
}

const NamedStyles = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
} as const;

function toEmoji(emoji: string): { animated?: boolean; name?: string; id?: string } {
  const custom = /^<(a?):([a-zA-Z0-9_]+):(\d+)>$/.exec(emoji);
  if (custom) return { animated: custom[1] === "a", name: custom[2], id: custom[3] };
  return { name: emoji };
}

export function actionRow(buttons: ActionButtonSpec[]): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const spec of buttons.slice(0, 5)) {
    const button = new ButtonBuilder()
      .setCustomId(spec.customId)
      .setLabel(spec.label)
      .setStyle(typeof spec.style === "string" ? NamedStyles[spec.style] : (spec.style ?? ButtonStyle.Secondary));
    if (spec.emoji) button.setEmoji(toEmoji(spec.emoji));
    if (spec.disabled !== undefined) button.setDisabled(spec.disabled);
    row.addComponents(button);
  }
  return row;
}

export interface SelectOptionSpec {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
}

export interface SelectRowSpec {
  customId: string;
  placeholder?: string;
  options: SelectOptionSpec[];
}

export function selectRow(spec: SelectRowSpec): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder().setCustomId(spec.customId);
  if (spec.placeholder) menu.setPlaceholder(spec.placeholder);
  menu.addOptions(
    ...spec.options.slice(0, 25).map((option) => {
      const built = new StringSelectMenuOptionBuilder()
        .setLabel(option.label)
        .setValue(option.value);
      if (option.description) built.setDescription(option.description);
      if (option.emoji) built.setEmoji(toEmoji(option.emoji));
      return built;
    }),
  );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export interface ModalTextSpec {
  kind?: "text";
  customId: string;
  label: string;
  style?: "short" | "paragraph";
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  value?: string;
}

export interface ModalUploadSpec {
  kind: "upload";
  customId: string;
  label: string;
  required?: boolean;
}

export type ModalFieldSpec = ModalTextSpec | ModalUploadSpec;

export interface ModalSpec {
  title: string;
  customId: string;
  fields: ModalFieldSpec[];
}

function textComponent(field: ModalTextSpec): unknown {
  return {
    type: 1,
    components: [
      {
        type: 4,
        custom_id: field.customId,
        label: field.label,
        style: field.style === "paragraph" ? 2 : 1,
        required: field.required ?? true,
        ...(field.maxLength !== undefined ? { max_length: field.maxLength } : {}),
        ...(field.minLength !== undefined ? { min_length: field.minLength } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.value !== undefined ? { value: field.value } : {}),
      },
    ],
  };
}

function uploadComponent(field: ModalUploadSpec): unknown {
  return {
    type: 18,
    label: field.label.slice(0, 45),
    component: {
      type: 19,
      custom_id: field.customId,
      required: field.required ?? false,
      min_values: 0,
      max_values: 1,
    },
  };
}

export function modal(spec: ModalSpec): { toJSON(): unknown } {
  return {
    toJSON: () => ({
      title: spec.title,
      custom_id: spec.customId,
      components: spec.fields.slice(0, 5).map((field) =>
        field.kind === "upload" ? uploadComponent(field) : textComponent(field),
      ),
    }),
  };
}
