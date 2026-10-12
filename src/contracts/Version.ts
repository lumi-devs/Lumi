import pkg from "../../package.json" with { type: "json" };

export const CONTRACT_VERSION: string = pkg.version;

export const MIN_COMPATIBLE_CONTRACT_VERSION: string = "0.6.0";

export const COMPATIBLE_CONTRACT_RANGE: string = `>=${MIN_COMPATIBLE_CONTRACT_VERSION} <=${CONTRACT_VERSION}`;
