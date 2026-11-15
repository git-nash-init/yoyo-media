// Console output for a non-expert admin: plain sentences, one live progress line.
const tty = Boolean(process.stdout.isTTY);
let liveOpen = false;
let lastLoggedPct = -1;

function closeLive() {
  if (liveOpen) {
    process.stdout.write("\n");
    liveOpen = false;
  }
}

export const ui = {
  info(msg = "") {
    closeLive();
    console.log(msg);
  },
  step(msg: string) {
    closeLive();
    console.log(`  - ${msg}`);
  },
  ok(msg: string) {
    closeLive();
    console.log(`✔ ${msg}`);
  },
  warn(msg: string) {
    closeLive();
    console.log(`! ${msg}`);
  },
  error(msg: string) {
    closeLive();
    console.error(`✖ ${msg}`);
  },
  /** Live, self-overwriting line on a terminal; every 10 % when output is piped to a file. */
  progress(label: string, pct: number, detail = "") {
    const text = `    ${label} ${detail || `${pct}%`}`;
    if (tty) {
      process.stdout.write(`\r${text.padEnd(78).slice(0, Math.max(78, text.length))}`);
      liveOpen = true;
    } else {
      const bucket = Math.floor(pct / 10);
      if (bucket !== lastLoggedPct) {
        lastLoggedPct = bucket;
        console.log(text);
      }
    }
  },
  progressDone() {
    closeLive();
    lastLoggedPct = -1;
  },
};
