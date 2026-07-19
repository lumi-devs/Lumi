export const LumiInfo = {
  version: "2.1.1",
  codename: "Elysian",
  tagline: "The next-generation modular Discord command center",
  inception: new Date("2026-07-11T07:50:00Z"),
  github: "https://github.com/lumi-devs/lumi",
  getAgeInDays(): number {
    const diff = Date.now() - this.inception.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },
};
