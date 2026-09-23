import { describe, it, expect, vi, beforeEach } from 'bun:test';
import { ModNoteRepository } from '#modules/mod/data/ModNoteRepository.js';

describe('ModNoteRepository GDPR erasure', () => {
  let mockPrisma: any;
  let repo: ModNoteRepository;

  beforeEach(() => {
    mockPrisma = {
      modNote: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    repo = new ModNoteRepository(mockPrisma, {} as any, {} as any, {} as any);
  });

  it('deleteUserData removes notes where the user is the subject', async () => {
    await repo.deleteUserData('u1');

    expect(mockPrisma.modNote.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('deleteUserData anonymizes authorId on notes the user wrote about someone else', async () => {
    await repo.deleteUserData('u1');

    expect(mockPrisma.modNote.updateMany).toHaveBeenCalledWith({
      where: { authorId: 'u1' },
      data: { authorId: '0' },
    });
  });
});
