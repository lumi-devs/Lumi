export interface CustomIdCodec<F extends readonly string[]> {
  readonly prefix: string;
  build(values: Record<F[number], string>): string;
  parse(customId: string): Record<F[number], string> | null;
}

export function defineCustomId<const F extends readonly string[]>(
  prefix: string,
  fields: F,
): CustomIdCodec<F> {
  return {
    prefix,
    build(values) {
      const segments = fields.map((field) => {
        const value = values[field as F[number]];
        if (value.includes(":")) {
          throw new Error(
            `custom-id field "${field}" contains ":" and cannot round-trip`,
          );
        }
        return value;
      });
      return [prefix, ...segments].join(":");
    },
    parse(customId) {
      if (!customId.startsWith(`${prefix}:`)) return null;
      const segments = customId.slice(prefix.length + 1).split(":");
      if (segments.length !== fields.length) return null;
      const result = {} as Record<F[number], string>;
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const value = segments[i];
        if (field === undefined || value === undefined || value.length === 0) {
          return null;
        }
        result[field as F[number]] = value;
      }
      return result;
    },
  };
}
