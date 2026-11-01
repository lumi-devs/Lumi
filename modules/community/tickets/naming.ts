export interface NamingContext {
  user: string;
  username: string;
  userId: string;
  category: string;
  number?: number;
}

const PlaceholderPattern = /\{(user|username|id|category|number)\}/g;

export function renderNamingTemplate(
  template: string,
  context: NamingContext,
): string {
  return template.replace(PlaceholderPattern, (_match, key: string) => {
    switch (key) {
      case "user":
        return context.user;
      case "username":
        return context.username;
      case "id":
        return context.userId;
      case "category":
        return context.category;
      case "number":
        return context.number === undefined ? "" : String(context.number);
      default:
        return "";
    }
  });
}

export function sanitizeThreadName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/\p{Cc}/gu, "")
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "-")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
  return (cleaned || "ticket").slice(0, 100);
}

export function ticketThreadName(
  template: string,
  context: NamingContext,
): string {
  return sanitizeThreadName(renderNamingTemplate(template, context));
}
