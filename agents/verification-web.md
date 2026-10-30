# Web verification

Module: `modules/security/verification/` (`security-verification`).
Dashboard route: `/verify/[token]` (implemented in the web app, not in this
repository).

## Flow

1. `guildMemberAdd` runs the normal verification checks. `mode: "web"` follows
   the same pending-role and Redis pending-entry path as `mode: "emoji"`.
2. The module generates a token with 32 cryptographically random bytes encoded
   as base64url, hashes it with SHA-256 hex, and stores a `VerificationToken`
   row (`guildId`, `userId`, `tokenHash`, `expiresAt`). The raw token is never
   stored or logged.
3. The member receives a Components V2 card with a Link button pointing at
   `${webBaseUrl}/verify/${token}`. As with emoji mode, the card goes to the
   configured security log channel when one exists, otherwise to the member's
   DMs.
4. `/verification send` issues the same web token/card for web mode.
5. When the member leaves, the module clears the Redis pending entry. Expired
   Redis pending entries continue to be handled by `verification-sweep`.
6. `verification-token-cleanup` runs hourly and deletes `VerificationToken` rows
   whose `expiresAt` is in the past.

The module does **not** grant roles for web verification and does not serve the
web page. The dashboard is responsible for completing verification.

## Config and environment

`webBaseUrl` is a module config field. It must be an absolute `http://` or
`https://` URL; trailing slashes are removed when building the link. When the
field is empty or absent, the module falls back to the `WEB_BASE_URL`
environment variable.

If neither source yields a valid URL, or if the database token insert fails or
the Prisma client is unavailable, the module logs a warning and sends the
existing emoji verification card instead. The member is never left without a
prompt. The pending role and timeout behaviour stay unchanged in that fallback.

## Token contract

Table: `VerificationToken` (`packages/db/prisma/schema.prisma`).

| Column      | Contract                                                       |
| ----------- | -------------------------------------------------------------- |
| `guildId`   | Guild that issued the challenge.                               |
| `userId`    | Member who must verify.                                        |
| `tokenHash` | SHA-256 hex of the raw URL-safe token (`@unique`).             |
| `expiresAt` | `createdAt + timeoutMinutes`; after this the token is dead.    |
| `usedAt`    | Set by the dashboard on first successful use; non-null = dead. |

Dashboard responsibilities for `/verify/[token]`:

1. Read `VerificationToken` by `tokenHash = sha256hex(token)`.
2. Reject when the row is missing, `usedAt` is non-null, or `expiresAt <= now`.
3. Grant `verifiedRoleId` and remove `pendingRoleId` through Discord REST.
4. Mark `usedAt` so the link is one-time.

Token helper functions live in `modules/security/verification/token.ts` and are
unit-tested without Discord or the database.

## Security notes

- Use `randomBytes(32)`, never math/random or Discord IDs, for token material.
- Only the SHA-256 hash is persisted. Do not log, echo, or store raw tokens.
- Treat the link as a bearer credential: anyone with it can complete the
  challenge until it expires or is used.
- Enforce expiry and one-time use on the server side (`expiresAt`, `usedAt`);
  never rely on the card text or client-side checks.
- The cleanup task removes expired rows. It does not remove unexpired unused
  rows, so a re-issued prompt can coexist with an older link until that older
  link expires.
