import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import {
  dataFile,
  loadOrMintKeyFile,
  openSealedString,
  sealString,
} from "#src/lib/crypto/Seal.js";

export interface SharedTokenView {
  service: string;
  updatedAt: Date;
}

function tokenKey(): Buffer {
  return loadOrMintKeyFile(dataFile("secrets", "tokens.key"));
}

function sealToken(token: string): string {
  return sealString(tokenKey(), token);
}

function openToken(sealed: string): string | null {
  return openSealedString(tokenKey(), sealed);
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
    if (!row) return null;
    const opened = openToken(row.token);
    if (opened !== null) return opened;
    if (!row.token.startsWith("v1.")) {
      await this.setToken(service, row.token);
      return row.token;
    }
    return null;
  }

  public async setToken(service: string, token: string): Promise<void> {
    const sealed = sealToken(token);
    await this.prisma.sharedApiToken.upsert({
      where: { service },
      create: { service, token: sealed },
      update: { token: sealed },
    });
  }

  public async deleteToken(service: string): Promise<boolean> {
    const { count } = await this.prisma.sharedApiToken.deleteMany({ where: { service } });
    return count > 0;
  }
}
