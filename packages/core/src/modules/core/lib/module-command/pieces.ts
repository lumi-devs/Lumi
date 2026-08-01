import type { container } from "@sapphire/framework";

export interface ModulePiecesInfo {
  /** Piece names grouped by the store that loaded them. */
  piecesByStore: Record<string, string[]>;
  totalPieces: number;
}

/**
 * Collects every loaded piece owned by `moduleName`, grouped by store.
 *
 * Ownership is resolved from each piece's on-disk location, so a module that
 * failed to load reports no pieces. The `modules` store is skipped because its
 * entries are the modules themselves, not their pieces.
 *
 * @param containerInstance - Container to read the stores from; passed in
 * rather than imported so callers can hand over a scoped container.
 */
export function getModulePiecesInfo(
  containerInstance: typeof container,
  moduleName: string,
): ModulePiecesInfo {
  const piecesByStore: Record<string, string[]> = {};
  let totalPieces = 0;

  for (const store of containerInstance.stores.values()) {
    if (store.name === "modules") continue;

    const pieces = [...store.values()].filter((piece) => {
      const name = containerInstance.moduleStore.moduleNameForLocation(
        piece.location.full,
      );
      return name === moduleName;
    });

    if (pieces.length > 0) {
      piecesByStore[store.name] = pieces.map((p) => p.name);
      totalPieces += pieces.length;
    }
  }

  return { piecesByStore, totalPieces };
}
