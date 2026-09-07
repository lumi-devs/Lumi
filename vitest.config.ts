import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		// Multiple forks under CI's Bun lose the Bun global entirely (works fine locally, single-fork).
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json', 'html', 'lcov']
		}
	}
});
