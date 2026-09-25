import chalk from "chalk";
import figlet from "figlet";

// Same stops as the brand gradient used across assets/*.svg.
const GRADIENT_STOPS: [number, [number, number, number]][] = [
  [0, [0x8f, 0xe1, 0xff]],
  [0.5, [0x3b, 0x82, 0xf6]],
  [1, [0x5b, 0x21, 0xb6]],
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function colorAt(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  let lo = GRADIENT_STOPS[0];
  let hi = GRADIENT_STOPS[GRADIENT_STOPS.length - 1];
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    if (clamped >= GRADIENT_STOPS[i][0] && clamped <= GRADIENT_STOPS[i + 1][0]) {
      lo = GRADIENT_STOPS[i];
      hi = GRADIENT_STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const localT = (clamped - lo[0]) / span;
  const [r1, g1, b1] = lo[1];
  const [r2, g2, b2] = hi[1];
  return `#${[lerp(r1, r2, localT), lerp(g1, g2, localT), lerp(b1, b2, localT)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * A downsampled (22x30) copy of assets/devbuddy-icon.svg's pixel colors,
 * cropped to its bounding box. Rendered two rows at a time with the "▀"
 * half-block character (foreground = top pixel, background = bottom pixel)
 * so the terminal banner shows the same flame shape as the SVG mark.
 */
const FLAME_PIXELS: (string | null)[][] = [
  [null, null, null, null, null, null, null, null, null, null, null, null, null, "#59a2f8", "#529cf8", null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, "#55a2fa", "#59a8fb", null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, "#529df8", "#5aacff", "#4d98fa", null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, "#519bf8", "#529fff", "#4d99ff", "#468ff8", null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, "#4f98f8", "#4f9cff", "#468ef6", "#4896ff", "#4086f5", null, null, null, null],
  [null, null, null, null, null, null, null, "#63b2fc", "#5facfb", null, null, null, null, "#4b94f7", "#4a94fc", "#448df6", "#418af8", "#3f88fc", "#3a81f2", null, null, null],
  [null, null, null, null, null, null, "#63aef9", "#6dc3ff", "#5ca8f9", null, null, null, "#4d97fa", "#4c97fd", "#458ef6", "#4189f6", "#3d85f6", "#3e86fc", "#3d7df2", null, null, null],
  [null, null, null, null, null, "#62aef8", "#68b9ff", "#5eaafb", "#59a4f8", null, null, null, "#4993f7", "#4c9aff", "#428af6", "#3f86f7", "#3c82f6", "#3b7cf2", "#4382ff", "#3f75ec", null, null],
  [null, null, null, null, "#61aef8", "#67b7ff", "#5fabfa", "#5aa5f9", "#57a3fb", null, null, null, "#478ef6", "#4791fe", "#3f87f5", "#3c83f6", "#3c7ff4", "#3d79f0", "#4178f3", "#4071ec", null, null],
  [null, null, null, null, "#65b2fb", "#62affc", "#5ba6f8", "#57a2f8", "#58a5ff", "#5099f8", null, "#4691f4", "#4894fe", "#4088f6", "#3d84f6", "#3b80f5", "#3d7bf2", "#3f77ef", "#3f72ea", "#4776fa", "#4369e6", null],
  [null, null, null, "#63aef9", "#67b8ff", "#5ca6f8", "#59a4f9", "#559ff8", "#55a3ff", "#4e97f8", null, "#448df7", "#4591fe", "#3d85f6", "#3c81f5", "#3d7df2", "#3e78f0", "#4074ed", "#406fe9", "#466ff1", "#4367e3", null],
  [null, null, "#64b3fc", "#68baff", "#5da8f9", "#5aa5f9", "#56a0f9", "#519cf7", "#53a1ff", null, "#428af5", "#4895ff", "#3e86f6", "#3b82f6", "#3c7ef3", "#3e79f0", "#3f75ed", "#4170ea", "#426ce7", "#4468e5", "#4564e4", "#4462e1"],
  [null, null, "#62affa", "#62b0fd", "#5aa6f8", "#57a2f9", "#539df8", "#519cfc", "#4c95f8", "#4891f8", "#448ffa", "#418bfa", "#3c83f5", "#3c7ff4", "#3e7bf1", "#3f76ee", "#4072eb", "#426de8", "#4369e5", "#4464e2", "#4a65eb", "#475bdc"],
  [null, "#62affa", "#67b9ff", "#5ba5f8", "#58a3f9", "#549ff9", "#509af7", "#4e99fc", "#4991f7", "#448df7", "#448efe", "#3c83f4", "#3c80f5", "#3d7cf2", "#3e77ef", "#4073ec", "#416ee9", "#436ae6", "#4565e3", "#4561e0", "#4b60e7", "#4858da"],
  [null, "#61acfa", "#61b0ff", "#58a4f8", "#55a0f9", "#529bf8", "#4e97f8", "#4992f7", "#4790fa", "#438dfb", "#3d84f5", "#3b81f6", "#3d7df3", "#3e78f0", "#4074ed", "#4170ea", "#426be7", "#4467e4", "#4562e1", "#475edd", "#4a5be0", "#4955d8"],
  ["#5faffb", "#60adfc", "#5aa4f9", "#56a1f9", "#539df8", "#4f98f8", "#4b94f8", "#4790f7", "#438bf6", "#3f86f5", "#3c83f6", "#3c7ef3", "#3e7af1", "#3f75ee", "#4171eb", "#426ce8", "#4468e5", "#4563e2", "#475fdf", "#485adb", "#4b57dc", "#4a52d5"],
  ["#5faaf9", "#60b0ff", "#57a1f8", "#549ef9", "#5099f8", "#4c95f8", "#4891f7", "#448cf7", "#4088f6", "#3d84f6", "#3c7ff4", "#3e7bf1", "#3f76ee", "#4072ec", "#426de9", "#4369e6", "#4565e3", "#4660e0", "#485cdd", "#4957d9", "#4c54da", "#4c4ed4"],
  ["#5ba7f8", "#5caaff", "#549ef8", "#519bf8", "#4d96f8", "#4992f8", "#458ef7", "#4189f7", "#3d85f6", "#3b81f5", "#3d7cf2", "#3f77ef", "#4073ec", "#416fe9", "#436ae6", "#4466e3", "#4661e1", "#475dde", "#4958da", "#4a54d7", "#4d51d9", "#4d4bd1"],
  ["#59a4f9", "#58a4fe", "#529bf7", "#4e98f8", "#4a93f8", "#468ff7", "#438af7", "#3f86f6", "#3b82f6", "#3c7df3", "#3e79f0", "#4074ed", "#4170ea", "#426be7", "#4467e4", "#4563e1", "#475ede", "#485adb", "#4a55d8", "#4a50d5", "#504fdb", "#4e49d0"],
  ["#56a1f9", "#54a0fd", "#4f98f7", "#4b94f8", "#4790f7", "#438cf7", "#4087f7", "#3c83f6", "#3c7ef4", "#3d7af1", "#3f76ee", "#4171eb", "#426de8", "#4368e5", "#4564e2", "#465fdf", "#485bdc", "#4956d9", "#4b52d6", "#4b4dd3", "#524cdb", "#4f44cd"],
  ["#539ef8", "#529dfe", "#4c95f7", "#4891f7", "#458df7", "#4188f6", "#3d84f6", "#3c80f5", "#3d7bf1", "#3f77ef", "#4072ec", "#426ee9", "#4369e6", "#4565e3", "#4660e0", "#475cdd", "#4958da", "#4a53d7", "#4c4fd4", "#4d4ad1", "#5248d5", "#4e42cc"],
  ["#509af8", "#519dff", "#4992f6", "#458ef7", "#428af7", "#3e85f6", "#3c81f5", "#3d7cf2", "#3e78ef", "#4073ed", "#416fea", "#436ae7", "#4466e4", "#4662e1", "#475dde", "#4959db", "#4a54d8", "#4b50d5", "#4d4bd1", "#5049d4", "#4f42cc", null],
  ["#4d96f8", "#4f9cff", "#458ef6", "#438bf7", "#3f86f7", "#3c82f6", "#3d7df3", "#3e79f0", "#3f75ed", "#4170ea", "#426ce8", "#4467e4", "#4563e2", "#475edf", "#485adc", "#4a56d9", "#4b51d6", "#4c4dd3", "#4e48cf", "#5649dc", "#5041cc", null],
  [null, "#4891f8", "#448efa", "#4087f6", "#3c83f6", "#3c7ff4", "#3e7af1", "#3f76ee", "#4071eb", "#426de8", "#4369e5", "#4564e2", "#4660df", "#485bdc", "#4957da", "#4b52d6", "#4c4ed4", "#4d49d0", "#4f45d0", "#5241cf", null, null],
  [null, "#438cf6", "#4794ff", "#3b83f4", "#3b80f5", "#3d7cf2", "#3f77ef", "#4073ec", "#426ee9", "#436ae6", "#4466e3", "#4661e0", "#475ddd", "#4958da", "#4a54d7", "#4c4fd4", "#4d4bd2", "#4e46ce", "#5747dd", "#513dc8", null, null],
  [null, null, "#3e87f9", "#3d86fc", "#3c7cf0", "#3e78f0", "#4074ed", "#416fea", "#436be7", "#4466e4", "#4562e1", "#475dde", "#4959db", "#4a55d8", "#4c50d5", "#4d4cd3", "#4d47cf", "#5647da", "#513fca", null, null, null],
  [null, null, "#387df2", "#3e82f9", "#407ef9", "#3e73eb", "#4170ea", "#426ce8", "#4468e5", "#4563e2", "#475fdf", "#485adc", "#4a56d9", "#4b51d6", "#4c4dd3", "#4d48d0", "#5549dc", "#5240cf", null, null, null, null],
  [null, null, null, "#3a75ee", "#407af5", "#457bfe", "#436feb", "#4269e4", "#4464e2", "#4660df", "#475bdc", "#4957d8", "#4a52d7", "#4b4ed3", "#504cd6", "#564bdf", "#5243cf", null, null, null, null, null],
  [null, null, null, null, null, "#4170ef", "#446cea", "#486bef", "#4965e9", "#495fe2", "#4a5adf", "#4c56dd", "#4f53df", "#514edb", "#5048d4", "#5145d1", null, null, null, null, null, null],
  [null, null, null, null, null, null, null, "#4664e7", "#4860e2", "#4759db", "#4956da", "#4c51d8", "#4e4ed6", "#4e49d4", null, null, null, null, null, null, null, null],
];

function renderFlame(): string[] {
  const lines: string[] = [];
  for (let y = 0; y < FLAME_PIXELS.length; y += 2) {
    const top = FLAME_PIXELS[y];
    const bottom = FLAME_PIXELS[y + 1] ?? top.map(() => null);
    let line = "";
    for (let x = 0; x < top.length; x++) {
      const fg = top[x];
      const bg = bottom[x];
      if (!fg && !bg) line += " ";
      else if (fg && bg) line += chalk.hex(fg).bgHex(bg)("▀");
      else if (fg) line += chalk.hex(fg)("▀");
      else line += chalk.hex(bg as string)("▄");
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Renders "Dev" and "Buddy" as two separate figlet blocks and joins them
 * side by side, so the white/gradient color boundary always falls cleanly
 * between the words instead of mid-letter (which happened when splitting a
 * single combined render, since figlet's kerning shifts column boundaries
 * depending on which letters are adjacent).
 */
function renderWordmark(): string[] {
  const font = "ANSI Shadow";
  const devLines = figlet.textSync("Dev", { font }).split("\n");
  const buddyLines = figlet.textSync("Buddy", { font }).split("\n");
  const buddyWidth = Math.max(...buddyLines.map((l) => l.length));

  return devLines.map((devLine, i) => {
    const buddyLine = (buddyLines[i] ?? "").padEnd(buddyWidth, " ");
    const dev = [...devLine].map((ch) => (ch === " " ? ch : chalk.whiteBright(ch))).join("");
    const buddy = [...buddyLine]
      .map((ch, col) => (ch === " " ? ch : chalk.hex(colorAt(col / Math.max(1, buddyWidth - 1)))(ch)))
      .join("");
    return dev + " " + buddy;
  });
}

const TAGLINE = "local-first CLI developer agent · by tokenburners";

/** The full flame+figlet banner's widest rendered line is 92 columns - anything
 *  narrower wraps mid-glyph and renders as broken, disconnected fragments. */
const MIN_FULL_BANNER_WIDTH = 94;

/** A single-line wordmark with the same white "Dev" / gradient "Buddy" treatment
 *  as the full banner, for terminals too narrow for the flame art to render cleanly. */
function renderCompactWordmark(): string {
  const dev = chalk.whiteBright.bold("Dev");
  const buddyChars = [...("Buddy")];
  const buddy = buddyChars
    .map((ch, i) => chalk.hex(colorAt(i / Math.max(1, buddyChars.length - 1))).bold(ch))
    .join("");
  return `${dev}${buddy}`;
}

function printCompactBanner(): void {
  console.log();
  console.log(renderCompactWordmark());
  console.log(chalk.dim(TAGLINE));
  console.log();
}

export function printBanner(): void {
  // process.stdout.columns is undefined when stdout isn't a real TTY (piped/redirected) -
  // treat that the same as "narrow": there's no terminal to render wide art into anyway.
  const columns = process.stdout.columns ?? 0;
  if (columns < MIN_FULL_BANNER_WIDTH) {
    printCompactBanner();
    return;
  }

  const flameLines = renderFlame();
  const wordmarkLines = renderWordmark();
  const tagline = chalk.dim(TAGLINE);

  const totalRows = Math.max(flameLines.length, wordmarkLines.length + 1);
  const textBlock = [...wordmarkLines, tagline];
  const topPad = Math.floor((totalRows - textBlock.length) / 2);

  console.log();
  for (let i = 0; i < totalRows; i++) {
    const flame = flameLines[i] ?? "";
    const textIndex = i - topPad;
    const text = textIndex >= 0 && textIndex < textBlock.length ? textBlock[textIndex] : "";
    console.log(`${flame}  ${text}`);
  }
  console.log();
}
