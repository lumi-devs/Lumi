const activeMembers = new Map<string, Set<string>>();

export async function trackVoiceOccupancy(
  _userId: string,
  oldChannelId: string | null,
  newChannelId: string | null,
): Promise<{ channelId: string; wasEmpty: boolean; isEmpty: boolean } | null> {
  if (oldChannelId === newChannelId) return null;

  if (oldChannelId) {
    const set = activeMembers.get(oldChannelId);
    if (set) {
      set.delete(_userId);
      if (set.size === 0) {
        activeMembers.delete(oldChannelId);
        return { channelId: oldChannelId, wasEmpty: false, isEmpty: true };
      }
    }
  }

  if (newChannelId) {
    let set = activeMembers.get(newChannelId);
    if (!set) {
      set = new Set();
      activeMembers.set(newChannelId, set);
      set.add(_userId);
      return { channelId: newChannelId, wasEmpty: true, isEmpty: false };
    }
    set.add(_userId);
  }

  return null;
}

export async function isVoiceChannelEmpty(channelId: string): Promise<boolean> {
  const set = activeMembers.get(channelId);
  return !set || set.size === 0;
}

export async function clearVoiceOccupancyForChannels(
  channelIds: string[],
): Promise<void> {
  for (const id of channelIds) {
    activeMembers.delete(id);
  }
}

export async function trackVoiceState(
  _userId: string,
  _channelId: string | null,
): Promise<void> {}

export async function seedVoiceStates(
  _states: ReadonlyArray<{ user_id: string; channel_id: string | null }>,
): Promise<void> {}

export async function clearVoiceChannelOccupancy(
  channelId: string,
): Promise<void> {
  activeMembers.delete(channelId);
}
