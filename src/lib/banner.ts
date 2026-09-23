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
  const r = lerp(r1, r2, localT);
  const g = lerp(g1, g2, localT);
  const b = lerp(b1, b2, localT);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function gradientText(text: string): string {
  return [...text].map((ch, i) => chalk.hex(colorAt(i / Math.max(1, text.length - 1)))(ch)).join("");
}

// A small rounded flame blob, colored top (cyan) to bottom (violet) to echo
// the SVG mark. Deliberately a smooth rounded shape (no isolated thin spike).
const FLAME_LINES = ["  ▄▄", " ██████", "████████", "████████"];

export function printBanner(): void {
  const flameColors = FLAME_LINES.map((_, i) => colorAt(i / (FLAME_LINES.length - 1)));
  const wordmark = `${chalk.bold.whiteBright("Dev")}${chalk.bold(gradientText("Buddy"))}`;
  const tagline = chalk.dim("local-first CLI developer agent · by tokenburners");

  console.log();
  for (let i = 0; i < FLAME_LINES.length; i++) {
    const flame = chalk.hex(flameColors[i])(FLAME_LINES[i]);
    if (i === 1) console.log(`${flame}  ${wordmark}`);
    else if (i === 2) console.log(`${flame}  ${tagline}`);
    else console.log(flame);
  }
  console.log();
}
