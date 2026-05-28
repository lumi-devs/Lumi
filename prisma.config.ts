import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations'
	},
	datasource: {
		// Migrations (DDL + advisory locks) must bypass a transaction-pooled
		// PgBouncer and hit Postgres directly. DIRECT_POSTGRES_URL points straight
		// at Postgres; falls back to POSTGRES_URL when PgBouncer isn't in front.
		url: process.env.DIRECT_POSTGRES_URL ?? process.env.POSTGRES_URL
	}
});
