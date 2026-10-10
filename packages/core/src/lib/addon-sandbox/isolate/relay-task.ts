export const AddonRelayTaskName = "addon-relay";

export interface AddonRelayPayload {
  addon: string;
  task: string;
  payload: Record<string, unknown>;
}
