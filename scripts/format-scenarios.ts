// Rewrites docs/scenarios/data-*.mjs in the house format after an edit made in code (see `edit` below).
// Run with: npx tsx scripts/format-scenarios.ts
import { writeFileSync } from "node:fs";
import a from "../docs/scenarios/data-a.mjs";
import b from "../docs/scenarios/data-b.mjs";

const HEADER = "// Scenario catalogue. Prose in pt-BR (discovery), payloads in English.\n// `args` is the tool call; `sample` is the example state used by wireframes and e2e tests (never sent by the agent).\n";

/** Objects and arrays stay on one line while they fit; otherwise one entry per line. */
export function fmt(v: unknown, indent = 0): string {
  const flat = JSON.stringify(v);
  if (typeof v !== "object" || v === null || flat.length + indent <= 150) return flat;
  const pad = " ".repeat(indent + 2);
  const close = " ".repeat(indent);
  if (Array.isArray(v)) return `[\n${v.map((x) => pad + fmt(x, indent + 2)).join(",\n")}\n${close}]`;
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${fmt(x, indent + 2)}`).join(",\n")}\n${close}}`;
}

export function write(edit: (all: any[]) => void = () => {}) {
  edit([...a, ...b]);
  writeFileSync("docs/scenarios/data-a.mjs", `${HEADER}export default ${fmt(a)};\n`);
  writeFileSync("docs/scenarios/data-b.mjs", `${HEADER}export default ${fmt(b)};\n`);
}

if (process.argv[1]?.endsWith("format-scenarios.ts")) write();
