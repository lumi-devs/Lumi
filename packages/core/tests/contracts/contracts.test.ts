import { describe, it, expect } from 'vitest';
import { KnownSubstores } from '@lumi/contracts';

describe('Contracts Package Tests', () => {
  it('KnownSubstores includes mandatory sub-stores', () => {
    expect(KnownSubstores).toContain('commands');
    expect(KnownSubstores).toContain('listeners');
    expect(KnownSubstores).toContain('scheduled-tasks');
  });
});
