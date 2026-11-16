// Validates every scenario payload against the tool schemas, strictly (unknown keys fail).
// Run with: npm run test:scenarios
import { z } from "zod";
import { DecisionSchema, ViewSchema } from "../shared/schema.js";
import { lint } from "../shared/lint.js";
import a from "../docs/scenarios/data-a.mjs";
import b from "../docs/scenarios/data-b.mjs";

/** Reports keys the schema would silently drop. */
function unknownKeys(input: unknown, parsed: unknown, path: string, out: string[]) {
  if (Array.isArray(input)) input.forEach((v, i) => unknownKeys(v, (parsed as unknown[])?.[i], `${path}[${i}]`, out));
  else if (input && typeof input === "object")
    for (const [k, v] of Object.entries(input)) {
      if (parsed == null || !(k in (parsed as object))) out.push(`${path}.${k}`);
      else unknownKeys(v, (parsed as Record<string, unknown>)[k], `${path}.${k}`, out);
    }
}

let failed = 0;
[...a, ...b].forEach((sc: { slug: string; tool: string; args: unknown }, i) => {
  const schema = sc.tool === "present_decision" ? DecisionSchema : ViewSchema;
  const res = schema.safeParse(sc.args);
  const problems: string[] = [];
  if (!res.success) problems.push(z.prettifyError(res.error));
  else {
    unknownKeys(sc.args, res.data, "args", problems);
    problems.push(...lint(res.data));
  }
  if (problems.length) {
    failed++;
    console.log(`✗ ${i + 1} ${sc.slug}\n  ${problems.join("\n  ")}`);
  }
});
console.log(failed ? `${failed} scenario(s) do not match the schema` : `ok: ${a.length + b.length} scenarios match the schema`);
process.exit(failed ? 1 : 0);
