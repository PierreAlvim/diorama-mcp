import type { z } from "zod";
import { answerables, lint } from "./lint.js";
import { DecisionSchema, ViewSchema, type Decision, type View } from "./schema.js";

/**
 * What a `present_view` / `present_decision` call returns to the model.
 * Shared by the server (the real tool result) and the playground (which shows the same text without a server).
 */

export type PresentTool = "present_view" | "present_decision";
export type Problem = { path: string; message: string };
export type Outcome = { ok: true; doc: View | Decision; text: string } | { ok: false; problems: Problem[]; text: string };

/** What the model reads back. Kept short: the rich version lives in the view only. */
export function summarize(v: View | Decision): string {
  if (!("response" in v)) return `View "${v.title}" is on screen (${v.blocks.map((b) => b.type).join(", ")}). It does not need an answer: continue, and mention briefly what the view shows.`;
  const { type, of, depth } = v.response;
  const targets = of === undefined ? [] : Array.isArray(of) ? of : [of];
  const lines = targets.flatMap((t) => {
    const block = v.blocks.find((b) => b.id === t)!;
    return answerables(block, depth).map((a) => `- ${targets.length > 1 ? `${t}/` : ""}${a.id}: ${a.label}`);
  });
  return [
    `Decision view "${v.title}" is on screen (${type}${lines.length ? "" : ", whole view"}).`,
    ...lines,
    "",
    "Stop here and wait. The user's answer arrives as their next message.",
    "Do not answer for them and do not continue the task until they reply.",
  ].join("\n");
}

export const lintFailure = (problems: string[]) => `The view was not shown. Fix these and call again:\n- ${problems.join("\n- ")}`;

/** `blocks[1].edges[3].to` */
export const pathText = (path: readonly PropertyKey[]) => path.reduce<string>((s, k) => (typeof k === "number" ? `${s}[${k}]` : s ? `${s}.${String(k)}` : String(k)), "");

function issues(error: z.ZodError): Problem[] {
  return error.issues.flatMap((i): Problem[] => {
    // A union that matched no member reports nothing useful at the top; the first member's issues are the readable ones.
    const inner = (i as { errors?: z.ZodError["issues"][] }).errors?.[0];
    if (i.code === "invalid_union" && inner?.length) return inner.map((e) => ({ path: pathText([...i.path, ...e.path]), message: e.message }));
    return [{ path: pathText(i.path), message: i.message }];
  });
}

/** Schema first, then references: the same two gates a real call goes through. */
export function check(tool: PresentTool, args: unknown): Outcome {
  const parsed = (tool === "present_decision" ? DecisionSchema : ViewSchema).safeParse(args);
  if (!parsed.success) {
    const problems = issues(parsed.error);
    return { ok: false, problems, text: `Invalid arguments for ${tool}:\n- ${problems.map((p) => `${p.path || "(root)"}: ${p.message}`).join("\n- ")}` };
  }
  const doc = parsed.data as View | Decision;
  const found = lint(doc);
  if (found.length) return { ok: false, problems: found.map((message) => ({ path: "", message })), text: lintFailure(found) };
  return { ok: true, doc, text: summarize(doc) };
}
