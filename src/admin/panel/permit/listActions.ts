import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { errorMessage } from "../../../core/errors.js";
import { showEditModal } from "./editDialog.js";
import type { PermitHost } from "./host.js";
import { missingPermitCard } from "./listViews.js";


function pageFrom(raw: string): number {
  const page = Number(raw);
  return Number.isNaN(page) ? 0 : page;
}

export async function handleListAction(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;

  if (customId === "permit_back_main") {
    host.clearFlow();
    await interaction.update(await host.mainCard(0));
    return true;
  }

  if (customId === "permit_reorder") {
    await interaction.update(await host.reorderCard(0));
    return true;
  }

  if (customId.startsWith("permit_reorder_page:")) {
    const [, direction, rawPage] = customId.split(":");
    if (direction === "prev" || direction === "next") {
      await interaction.update(await host.reorderCard(pageFrom(rawPage)));
    }
    return true;
  }

  if (customId.startsWith("permit_move:")) {
    const [, direction, rawId, rawPage] = customId.split(":");
    if (direction !== "up" && direction !== "down") return true;
    const permitId = Number(rawId);
    if (!Number.isInteger(permitId)) return true;
    await host.permitRepo.movePermit(host.guildId, permitId, direction);
    await interaction.update(await host.reorderCard(pageFrom(rawPage)));
    return true;
  }

  if (customId.startsWith("permit_page:")) {
    const [, direction, rawPage] = customId.split(":");
    if (direction === "prev" || direction === "next") {
      await interaction.update(await host.mainCard(pageFrom(rawPage)));
    }
    return true;
  }

  if (customId.startsWith("permit_view:")) {
    host.clearFlow();
    await interaction.update(
      await host.detailCard(Number(customId.split(":")[1])),
    );
    return true;
  }

  if (customId.startsWith("permit_edit:")) {
    await showEditModal(host, Number(customId.split(":")[1]));
    return true;
  }

  if (customId.startsWith("permit_delete:")) {
    await interaction.update(
      await host.deleteCard(Number(customId.split(":")[1])),
    );
    return true;
  }

  if (customId.startsWith("permit_confirm_delete:")) {
    await handleConfirmDelete(host, Number(customId.split(":")[1]));
    return true;
  }

  return false;
}

export async function handleListSelect(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  if (customId !== "permit_select") return false;
  const interaction = host.interaction;
  if (!interaction.isStringSelectMenu()) return true;
  const value = interaction.values[0];
  if (value === undefined) return true;
  host.clearFlow();
  await interaction.update(await host.detailCard(Number(value)));
  return true;
}

async function handleConfirmDelete(
  host: PermitHost,
  permitId: number,
): Promise<void> {
  const interaction = host.interaction;

  const permit = await host.permitRepo.getPermit(host.guildId, permitId);
  if (!permit) {
    await interaction.update(missingPermitCard());
    return;
  }
  if (!host.canManageExtraOwnerPermit(permit)) {
    await interaction.update(host.extraOwnerError());
    return;
  }

  if (permit.builtin) {
    await interaction.update(
      makeErrorCard("Built-in Permit", "Built-in permits cannot be deleted."),
    );
    return;
  }

  try {
    await host.permitRepo.deletePermit(permitId);
    await interaction.update(await host.mainCard(0));
    await interaction.followUp(
      ephemeralCard(
        makeSuccessCard(
          "Permit Deleted",
          `Removed **#${permit.number} ${permit.name}** and its assignments.`,
        ),
      ),
    );
  } catch (error: unknown) {
    await interaction.followUp(
      ephemeralCard(
        makeErrorCard(
          "Delete Failed",
          `Could not delete the permit: ${errorMessage(error)}`,
        ),
      ),
    );
  }
}
