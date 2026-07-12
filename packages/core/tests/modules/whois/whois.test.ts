import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhoisCommand } from '../../../src/modules/utility/whois/commands/whois.js';
import { container } from '@sapphire/framework';
import type { User, GuildMember } from 'discord.js';

describe('WhoisCommand', () => {
  let command: WhoisCommand;

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

    command = new WhoisCommand(
      {
        name: 'whois',
        path: '/path/to/whois.ts',
        root: '/path/to',
        store: { name: 'commands' } as any
      } as any,
      {}
    );
  });

  it('should construct a whois card with expected user and member info', () => {
    const mockUser = {
      id: '12345',
      username: 'lumiuser',
      discriminator: '0000',
      bot: false,
      createdAt: new Date('2026-07-11T00:00:00Z'),
      toString: () => '<@12345>',
      displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
    } as unknown as User;

    const mockMember = {
      id: '12345',
      guild: { id: 'guild1' },
      displayColor: 0xff0000,
      joinedAt: new Date('2026-07-12T00:00:00Z'),
      premiumSince: null,
      permissions: {
        has: vi.fn().mockReturnValue(false),
      },
      roles: {
        cache: {
          filter: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
          map: vi.fn().mockReturnValue(['@role1']),
          size: 1,
        },
      },
    } as unknown as GuildMember;

    const card = (command as any).buildWhoisCard(mockUser, mockMember, 'guild1');
    
    expect(card).toBeDefined();
    expect(card.components).toBeDefined();
    
    const json = card.components[0].toJSON();
    expect(json.components[0].content).toContain('lumiuser#0000');
    
    // Multi-part body components are separated by small dividers
    const userSec = json.components[2].content;
    expect(userSec).toContain('12345');

    const memberSec = json.components[4].content;
    expect(memberSec).toContain('Member Information');

    const rolesSec = json.components[6].content;
    expect(rolesSec).toContain('Roles [1]');
  });
});
