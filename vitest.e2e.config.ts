import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Only run tests in the e2e folder
		include: ['tests/e2e/**/*.test.ts'],
		// Black-box tests don't usually need coverage mapping to source files
		// directly, but you can configure it if you launch the server with c8/v8 instrumentation.
		coverage: {
			enabled: false
		}
	}
});
