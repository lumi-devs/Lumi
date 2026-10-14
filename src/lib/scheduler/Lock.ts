export function acquireSchedulerLock(
  _valkey: any,
  _onLost: () => void,
  _logger?: any,
): Promise<{ release: () => Promise<void> }> {
  return Promise.resolve({
    release: async () => {},
  });
}
