import { defineConfig } from 'prisma/config';

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
