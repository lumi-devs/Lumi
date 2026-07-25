import { describe, it, expect } from 'vitest';
import { rawGatewayStream, RAW_GATEWAY_CONSUMER_GROUP } from '@lumi/contracts';
import { KNOWN_SUBSTORES } from '@lumi/contracts';

describe('Contracts Package Tests', () => {
  it('rawGatewayStream generates lowercased redis stream names', () => {
    expect(rawGatewayStream('MESSAGE_CREATE')).toBe('lumi:gw:message_create');
    expect(rawGatewayStream('GUILD_CREATE')).toBe('lumi:gw:guild_create');
  });

  it('RAW_GATEWAY_CONSUMER_GROUP is correct', () => {
    expect(RAW_GATEWAY_CONSUMER_GROUP).toBe('lumi-workers');
  });

  it('KNOWN_SUBSTORES includes mandatory sub-stores', () => {
    expect(KNOWN_SUBSTORES).toContain('commands');
    expect(KNOWN_SUBSTORES).toContain('listeners');
    expect(KNOWN_SUBSTORES).toContain('scheduled-tasks');
  });
});
