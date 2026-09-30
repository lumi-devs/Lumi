export {};

console.log("sleep-until-signal started");
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
while (!stop) {
  await Bun.sleep(20);
}
console.log("sleep-until-signal exiting");
process.exit(0);
