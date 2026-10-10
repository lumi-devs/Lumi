export async function forEachLine(
  stream: AsyncIterable<Uint8Array> | number | undefined | null,
  onLine: (line: string) => void,
): Promise<void> {
  if (!stream || typeof stream === "number") return;
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    rest += decoder.decode(chunk, { stream: true });
    const parts = rest.split("\n");
    rest = parts.pop() ?? "";
    for (const part of parts) if (part) onLine(part);
  }
  rest += decoder.decode();
  if (rest) onLine(rest);
}
