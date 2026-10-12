import { Repository } from "#src/lib/prisma/repositories/Repository.js";

export interface SharedTokenView {
  service: string;
  updatedAt: Date;
}

export class SharedTokenRepository extends Repository {
  public async listTokens(): Promise<SharedTokenView[]> {
    const rows = await this.prisma.sharedApiToken.findMany({
      select: { service: true, updatedAt: true },
      orderBy: { service: "asc" },
    });
    return rows;
  }

  public async getToken(service: string): Promise<string | null> {
    const row = await this.prisma.sharedApiToken.findUnique({
      where: { service },
      select: { token: true },
    });
    return row?.token ?? null;
  }

  public async setToken(service: string, token: string): Promise<void> {
    await this.prisma.sharedApiToken.upsert({
      where: { service },
      create: { service, token },
      update: { token },
    });
  }

  public async deleteToken(service: string): Promise<boolean> {
    const { count } = await this.prisma.sharedApiToken.deleteMany({ where: { service } });
    return count > 0;
  }
}
