import pkg from "../../../package.json" with { type: "json" };

export const CoreVersion = pkg.version;

export const LumiInfo = {
  version: CoreVersion,
  github: "https://github.com/lumi-devs/lumi",
};
