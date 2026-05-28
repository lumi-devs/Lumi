import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ['tsconfig.json'] })],
	test: {
		environment: 'node',
		include: ['packages/core/tests/**/*.test.ts'],
		coverage: {
			reporter: ['text', 'json', 'html']
		}
	}
});
