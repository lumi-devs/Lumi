import type { User, Prisma } from "@prisma/client";
import { Repository } from "#root/prisma/repositories/Repository.js";

/** The core `User` profile table. */
export class UserRepository extends Repository {
  public async getUser(userId: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  }

  public async updateUser(
    userId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data });
  }
}
