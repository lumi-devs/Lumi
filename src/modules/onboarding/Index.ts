import { defineModule } from "#src/lib/module-system/Module.js";

export const onboardingModule = defineModule({
  name: "onboarding",
  displayName: "Onboarding",
  description: "Help, setup, and server info commands.",
  short: "Help, setup wizard, and info commands.",
  endUserDataStatement:
    "Stores no personal end-user data beyond standard command usage.",
  emoji: "👋",
  disableable: true,
  category: "Utility",
});
