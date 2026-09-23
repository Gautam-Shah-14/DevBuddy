import chalk from "chalk";

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

function gradientText(text: string): string {
  return [...text].map((ch, i) => chalk.hex(colorAt(i / Math.max(1, text.length - 1)))(ch)).join("");
}

/**
 * A downsampled (16x20) copy of assets/devbuddy-icon.svg's pixel colors,
 * cropped to its bounding box. Rendered two rows at a time with the "▀"
 * half-block character (foreground = top pixel, background = bottom pixel)
 * so the terminal banner shows the same flame shape as the SVG mark, not
 * just a generic approximation.
 */
const FLAME_PIXELS: (string | null)[][] = [
  [null, null, null, null, null, null, null, null, null, null, "#569ef8", null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, "#57a6ff", "#4b95f6", null, null, null, null],
  [null, null, null, null, null, null, null, null, null, "#4f9bf8", "#529fff", "#4c99ff", "#428af3", null, null, null],
  [null, null, null, null, null, "#62aefa", "#5eaaf5", null, null, "#4c95f6", "#4e9cff", "#448df8", "#4089fa", null, null, null],
  [null, null, null, null, "#63aef8", "#6ec4ff", "#5ca7fa", null, null, "#4992f8", "#4995ff", "#3e86f5", "#3f87fe", "#3c7cf2", null, null],
  [null, null, null, "#64adf7", "#66b6ff", "#60b0ff", "#56a0f8", null, null, "#4791f9", "#4189f8", "#3c82f5", "#3b7bf1", "#447fff", "#4071eb", null],
  [null, null, "#66b0fb", "#65b4fd", "#5ca9fa", "#5aa8ff", "#529bf8", null, "#468cf6", "#4794ff", "#3b83f5", "#3c7ef3", "#3e77ee", "#4375f2", "#426be5", null],
  [null, null, "#63b1fb", "#60aefd", "#58a2f8", "#58a7ff", "#4e98f7", null, "#4590fa", "#3e86f8", "#3c7ff3", "#3e79f0", "#4073ec", "#416be7", "#476aed", "#4462e0"],
  [null, "#61aef9", "#67b9ff", "#58a2f8", "#539ef7", "#529ffe", "#4993f7", "#438bf7", "#428dfe", "#3b80f3", "#3e7af1", "#4074ed", "#426ee9", "#4368e4", "#4966eb", "#485cdc"],
  [null, "#60acfa", "#5ba7fb", "#559ff8", "#5099f8", "#4a93f8", "#458df6", "#418bfd", "#3b80f4", "#3d7cf2", "#3f75ee", "#416fe9", "#4369e5", "#4562e1", "#495ee2", "#4957d9"],
  ["#5facf9", "#61b0ff", "#559ff8", "#519af8", "#4b95f8", "#468ff7", "#4189f7", "#3c83f5", "#3d7df2", "#3f76ee", "#4170ea", "#436ae6", "#4564e2", "#475ede", "#4a58dc", "#4a51d6"],
  ["#5ba6f8", "#5aa7ff", "#519bf8", "#4c95f8", "#4790f7", "#428af7", "#3c83f6", "#3c7ef3", "#3e78ef", "#4072eb", "#436be7", "#4465e3", "#465fdf", "#4859da", "#4b54da", "#4c4dd2"],
  ["#57a3f9", "#549ffc", "#4d96f7", "#4891f7", "#438bf7", "#3d85f6", "#3c7ff4", "#3e79f0", "#4073ec", "#426de8", "#4466e4", "#4660e0", "#485adc", "#4a54d7", "#4f50da", "#4e48cf"],
  ["#549df8", "#509afc", "#4992f7", "#448cf7", "#3e86f7", "#3c80f5", "#3e7af1", "#4074ed", "#426ee9", "#4468e5", "#4662e1", "#485cdc", "#4a55d9", "#4b4fd4", "#524ddc", "#4f43cc"],
  ["#4f97f7", "#4d99ff", "#458df6", "#4088f7", "#3c81f5", "#3d7bf2", "#3f75ed", "#416fea", "#4369e5", "#4563e2", "#475ddd", "#4957d9", "#4b51d5", "#4d4ad2", "#5045d0", "#4e40cc"],
  ["#4b93f8", "#4b98ff", "#4088f6", "#3c83f6", "#3d7cf3", "#3f76ee", "#4170ea", "#436ae6", "#4564e2", "#475ede", "#4958da", "#4b52d6", "#4c4bd1", "#554adc", "#513fc9", null],
  [null, "#4189f6", "#408cff", "#3c7df2", "#3e78ef", "#4071eb", "#436be7", "#4465e3", "#465fdf", "#4859db", "#4b53d7", "#4c4dd2", "#5149d5", "#5242d0", null, null],
  [null, null, "#3e83f8", "#4281ff", "#3f72ea", "#416ce7", "#4466e3", "#4660e0", "#485adb", "#4953d7", "#4b4ed2", "#534cdb", "#5243d2", "#4f3cc5", null, null],
  [null, null, null, "#4078f2", "#4472f1", "#476cef", "#4763e5", "#495cdf", "#4b57dd", "#4f53de", "#514cd9", "#5245d3", null, null, null, null],
  [null, null, null, null, "#426ceb", "#4766e7", "#475ee1", "#4a58db", "#4c51d8", "#4f4dd6", "#5148d3", null, null, null, null, null],
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
      if (!fg && !bg) {
        line += " ";
      } else if (fg && bg) {
        line += chalk.hex(fg).bgHex(bg)("▀");
      } else if (fg) {
        line += chalk.hex(fg)("▀");
      } else {
        line += chalk.hex(bg as string)("▄");
      }
    }
    lines.push(line);
  }
  return lines;
}

export function printBanner(): void {
  const flameLines = renderFlame();
  const wordmark = `${chalk.bold.whiteBright("Dev")}${chalk.bold(gradientText("Buddy"))}`;
  const tagline = chalk.dim("local-first CLI developer agent · by tokenburners");
  const midpoint = Math.floor(flameLines.length / 2);

  console.log();
  for (let i = 0; i < flameLines.length; i++) {
    if (i === midpoint - 1) console.log(`${flameLines[i]}  ${wordmark}`);
    else if (i === midpoint) console.log(`${flameLines[i]}  ${tagline}`);
    else console.log(flameLines[i]);
  }
  console.log();
}
