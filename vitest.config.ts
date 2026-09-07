import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: 'node',
		include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json', 'html', 'lcov']
		}
	}
});
