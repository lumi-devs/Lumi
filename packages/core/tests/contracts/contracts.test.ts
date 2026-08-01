import { describe, it, expect } from 'vitest';
import { KNOWN_SUBSTORES } from '@lumi/contracts';

describe('Contracts Package Tests', () => {
  it('KNOWN_SUBSTORES includes mandatory sub-stores', () => {
    expect(KNOWN_SUBSTORES).toContain('commands');
    expect(KNOWN_SUBSTORES).toContain('listeners');
    expect(KNOWN_SUBSTORES).toContain('scheduled-tasks');
  });
});
