import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Must be its own preload file, loaded before tests/setup.ts in bunfig.toml's
// `preload` array: ES module static imports all resolve before any of a
// module's own top-level code runs, so if this call lived in the same file
// as `import { cleanup } from "@testing-library/react"`, that import would
// still load (and testing-library's `screen` singleton would still bind to
// a missing `document`) before this line ever executed.
GlobalRegistrator.register();
