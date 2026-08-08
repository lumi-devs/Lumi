import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The Prisma CLI runs under Node, which never auto-loads `.env` the way `bun run`
// does — without this every `db:push`/`migrate` fails on a missing datasource url.
loadEnv();

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		// Connect directly to bypass transaction pooler if present.
		url: process.env.DIRECT_POSTGRES_URL ?? process.env.POSTGRES_URL
	}
});
