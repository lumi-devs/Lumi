import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerInfoCommand } from '../../../src/modules/utility/serverinfo/commands/serverinfo.js';
import { container } from '@sapphire/framework';

describe('ServerInfoCommand', () => {
  let command: ServerInfoCommand;

  beforeEach(() => {
    vi.restoreAllMocks();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    (container as any).client = {
      options: {}
    } as any;

    command = new ServerInfoCommand(
      {
        name: 'serverinfo',
        path: '/path/to/serverinfo.ts',
        root: '/path/to',
        store: { name: 'commands' } as any
      } as any,
      {}
    );
  });

  it('should construct a serverinfo card with correct guild metrics', async () => {
    const mockGuild = {
      id: 'guild1',
      name: 'Lumi Home',
      createdAt: new Date('2026-07-11T00:00:00Z'),
      memberCount: 42,
      premiumSubscriptionCount: 5,
      premiumTier: 1,
      verificationLevel: 'MEDIUM',
      iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
      fetchOwner: vi.fn().mockResolvedValue({
        id: 'owner1',
        user: {
          toString: () => '<@owner1>',
        },
      }),
      channels: {
        cache: {
          size: 10,
          filter: vi.fn().mockReturnValue({ size: 3 }),
        },
      },
      emojis: {
        cache: {
          size: 15,
        },
      },
      roles: {
        cache: {
          size: 8,
        },
      },
    };

    const mockCtx = {
      guild: mockGuild,
    } as any;

    const card = await (command as any).buildServerCard(mockCtx);
    
    expect(card).toBeDefined();
    expect(card.components).toBeDefined();
    
    const json = card.components[0].toJSON();
    expect(json.components[0].content).toContain('Lumi Home');
    
    const ownerSec = json.components[2].content;
    expect(ownerSec).toContain('owner1');

    const memberSec = json.components[4].content;
    expect(memberSec).toContain('Total Members');

    const channelSec = json.components[6].content;
    expect(channelSec).toContain('Channels');
  });
});
