import type { PermitTargetType } from "@lumi/permits";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { errorMessage } from "../../../core/errors.js";
import type { AssignFlow } from "../../permits/flows.js";
import { expiryFromValue, targetMention, targetTypeLabel } from "../../permits/format.js";
import type { PermitHost } from "./host.js";
import { missingPermitCard } from "./listViews.js";

export async function handleAssignAction(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;

  if (customId.startsWith("permit_assign:")) {
    const permitId = Number(customId.split(":")[1]);
    const permit = await host.permitRepo.getPermit(host.guildId, permitId);
    if (!permit) {
      await interaction.update(missingPermitCard());
      return true;
    }
    if (!host.canManageExtraOwnerPermit(permit)) {
      await interaction.update(host.extraOwnerError());
      return true;
    }
    const flow: AssignFlow = {
      kind: "assign",
      permitId,
      targetType: "USER",
      targetId: undefined,
    };
    host.setFlow(flow);
    await interaction.update(await host.assignCard(flow));
    return true;
  }

  if (customId.startsWith("permit_unassign:")) {
    await interaction.update(
      await host.unassignCard(Number(customId.split(":")[1])),
    );
    return true;
  }

  return false;
}

export async function handleAssignSelect(
  host: PermitHost,
  customId: string,
): Promise<boolean> {
  const interaction = host.interaction;

  if (
    customId !== "permit_assign_type" &&
    customId !== "permit_assign_target" &&
    customId !== "permit_assign_expiry" &&
    !customId.startsWith("permit_unassign_select:")
  ) {
    return false;
  }
  if (!interaction.isAnySelectMenu()) return true;

  if (customId.startsWith("permit_unassign_select:")) {
    const permitId = Number(customId.split(":")[1]);
    const value = interaction.values[0];
    if (value === undefined) return true;
    const separator = value.indexOf(":");
    if (separator === -1) return true;

    const targetType = value.slice(0, separator) as PermitTargetType;
    const targetId = value.slice(separator + 1);

    try {
      await host.permitRepo.unassignPermit(permitId, targetType, targetId);
      await interaction.update(await host.detailCard(permitId));
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard(
            "Assignment Removed",
            `Removed ${targetTypeLabel(targetType)} ${targetMention(targetType, targetId)}.`,
          ),
        ),
      );
    } catch (error: unknown) {
      await interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Unassign Failed",
            `Could not remove the assignment: ${errorMessage(error)}`,
          ),
        ),
      );
    }
    return true;
  }

  const flow = host.getFlow();
  if (flow?.kind !== "assign") {
    await interaction.update(await host.mainCard(0));
    return true;
  }

  const permit = await host.permitRepo.getPermit(host.guildId, flow.permitId);
  if (!permit) {
    await interaction.update(missingPermitCard());
    return true;
  }
  if (!host.canManageExtraOwnerPermit(permit)) {
    await interaction.update(host.extraOwnerError());
    return true;
  }
  if (permit.builtin) flow.targetType = "USER";

  if (customId === "permit_assign_type") {
    const value = interaction.values[0];
    if (value === "USER" || (permit.builtin && value !== undefined)) {
      flow.targetType = "USER";
    } else if (value === "ROLE") {
      flow.targetType = "ROLE";
    } else if (value === "CHANNEL") {
      flow.targetType = "CHANNEL";
    } else {
      return true;
    }
    flow.targetId = undefined;
    host.setFlow(flow);
    await interaction.update(await host.assignCard(flow));
    return true;
  }

  if (customId === "permit_assign_target") {
    const value = interaction.values[0];
    if (value === undefined) return true;
    flow.targetId = value;
    host.setFlow(flow);
    await interaction.update(await host.assignExpiryCard(flow));
    return true;
  }

  // permit_assign_expiry
  if (flow.targetId === undefined) {
    await interaction.update(await host.assignCard(flow));
    return true;
  }
  const expiryValue = interaction.values[0];
  if (expiryValue === undefined) return true;
  const expiresAt = expiryFromValue(expiryValue);
  if (expiresAt === undefined) return true;

  try {
    await host.permitRepo.assignPermit(
      flow.permitId,
      flow.targetType,
      flow.targetId,
      interaction.user.id,
      expiresAt,
    );
    host.clearFlow();
    await interaction.update(await host.detailCard(flow.permitId));
    await interaction.followUp(
      ephemeralCard(
        makeSuccessCard(
          "Permit Assigned",
          `Assigned **#${permit.number} ${permit.name}** to ${targetMention(
            flow.targetType,
            flow.targetId,
          )}.`,
        ),
      ),
    );
  } catch (error: unknown) {
    await interaction.followUp(
      ephemeralCard(
        makeErrorCard(
          "Assign Failed",
          `Could not assign the permit: ${errorMessage(error)}`,
        ),
      ),
    );
  }
  return true;
}
