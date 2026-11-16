import { answerables } from "../../shared/lint";
import { type El, elements } from "../../shared/state";
import type { Block, Decision, DecisionRecord, Response, View } from "../../shared/schema";

export type Doc = View | Decision;
export type { El };
export type Emph = "on" | "off" | "neutral";

export const isDecision = (d: Doc): d is Decision => "response" in d && !!d.response;

/** The host forwards raw tool arguments, so nothing has been validated or defaulted on this side. */
export function normalize(raw: unknown): Doc | null {
  const d = raw as Partial<Decision> | null;
  if (!d || !Array.isArray(d.blocks) || d.blocks.length === 0) return null;
  return { ...d, title: d.title ?? "", blocks: d.blocks.filter((b) => b && typeof b.type === "string") } as Doc;
}

/** Ids carried by more than one element: hovering one lights up the others. This is view behaviour; the agent declares nothing. */
export function repeated(doc: Doc): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const el of elements(doc)) {
    if (!el.id) continue;
    if (seen.has(el.id)) out.add(el.id);
    seen.add(el.id);
  }
  return out;
}

/**
 * Two independent things decide how an element looks:
 * the active state (what the element is, declared by the agent) and the spotlight (where to look right now).
 */
export interface Focus {
  state: string | null;
  /** `strict` is a walkthrough step: only the listed ids stay lit. A hover is not strict: it never fades what the agent highlighted. */
  spot?: { ids: Set<string>; strict: boolean };
}

/** `el` must already be resolved for the active state (see applyState). */
export function emphasis(el: El & { from?: string; to?: string }, focus: Focus, isEdge = false): Emph {
  // An element that carries the active state's id is that state seen in another block.
  const declared = el.emphasis ?? (el.id !== undefined && el.id === focus.state ? "highlighted" : "normal");
  if (focus.spot) {
    const { ids, strict } = focus.spot;
    if (el.id && ids.has(el.id)) return "on";
    if (isEdge && el.from && el.to && ids.has(el.from) && ids.has(el.to)) return "on";
    return !strict && declared === "highlighted" ? "on" : "off";
  }
  return declared === "highlighted" ? "on" : declared === "faded" ? "off" : "neutral";
}

// ---- answers -------------------------------------------------------------

/** `${blockId}/${itemId}` -> "one" | "yes" | "ok" | "no" */
export type Picks = Record<string, string>;
export const pickKey = (blockId: string, itemId: string) => `${blockId}/${itemId}`;

export function targets(r: Response | undefined): string[] {
  if (!r || r.of === undefined) return [];
  return Array.isArray(r.of) ? r.of : [r.of];
}

export function targetItems(doc: Decision): { block: Block & { id: string }; items: { id: string; label: string }[] }[] {
  return targets(doc.response).flatMap((t) => {
    const block = doc.blocks.find((b) => b.id === t);
    return block ? [{ block: block as Block & { id: string }, items: answerables(block, doc.response.depth) }] : [];
  });
}

export function togglePick(doc: Decision, picks: Picks, blockId: string, itemId: string, value?: "ok" | "no"): Picks {
  const key = pickKey(blockId, itemId);
  const next = { ...picks };
  const type = doc.response.type;
  if (type === "choose_one") {
    for (const k of Object.keys(next)) if (k.startsWith(blockId + "/")) delete next[k];
    if (picks[key] !== "one") next[key] = "one";
  } else if (type === "choose_many") {
    if (next[key]) delete next[key];
    else next[key] = "yes";
  } else if (value) {
    if (next[key] === value) delete next[key];
    else next[key] = value;
  }
  return next;
}

export type Verdict = "none" | "approved" | "rejected" | undefined;
export interface Answer {
  message: string;
  record: DecisionRecord;
  /** Short line for the confirmation box. */
  headline: string;
}

/** Whether the footer's primary button can be pressed. */
export function canSubmit(doc: Decision, picks: Picks): boolean {
  const groups = targetItems(doc);
  if (doc.response.type === "approve") return groups.length === 0 || Object.keys(picks).length > 0;
  if (doc.response.type === "choose_many") return true;
  return groups.length > 0 && groups.every((g) => g.items.some((i) => picks[pickKey(g.block.id, i.id)]));
}

export function buildAnswer(doc: Decision, picks: Picks, note: string, verdict?: Verdict): Answer {
  const groups = targetItems(doc);
  const type = doc.response.type;
  const trimmed = note.trim();
  const noteLine = trimmed ? `\nNote: ${trimmed}` : "";
  const rows: DecisionRecord["picks"] = [];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(", ");
  let message: string;
  let headline: string;

  if (verdict === "none") {
    for (const g of groups) for (const i of g.items) rows.push({ ...i, block: g.block.id, verdict: "not_chosen" });
    message = `Decision on "${doc.title}": none of the options work for me.` + (trimmed ? `\nReason: ${trimmed}` : "\nPlease propose different options.");
    headline = "None of the options";
  } else if (type === "choose_one") {
    const chosen = groups.map((g) => ({ g, item: g.items.find((i) => picks[pickKey(g.block.id, i.id)]) }));
    for (const g of groups) for (const i of g.items) rows.push({ ...i, block: g.block.id, verdict: picks[pickKey(g.block.id, i.id)] ? "chosen" : "not_chosen" });
    if (groups.length === 1) {
      const item = chosen[0].item!;
      message = `Decision on "${doc.title}": go with "${item.label}" (option id: ${item.id}).` + noteLine;
      headline = `Chosen: ${item.label}`;
    } else {
      message = `Resolutions for "${doc.title}": ${chosen.map((c) => `${c.g.block.id} → ${c.item!.id}`).join(", ")}.` + noteLine;
      headline = `${chosen.length} choices confirmed`;
    }
  } else if (type === "choose_many") {
    const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, block: g.block.id, on: !!picks[pickKey(g.block.id, i.id)] })));
    for (const i of all) rows.push({ id: i.id, label: i.label, block: i.block, verdict: i.on ? "chosen" : "not_chosen" });
    const yes = all.filter((i) => i.on);
    const no = all.filter((i) => !i.on);
    message = `Selection for "${doc.title}": ${yes.length ? ids(yes) : "nothing selected"}.` + (no.length && yes.length ? ` Not selected: ${ids(no)}.` : "") + noteLine;
    headline = `${yes.length} of ${all.length} selected`;
  } else if (groups.length === 0) {
    const ok = verdict !== "rejected";
    rows.push({ id: "view", label: doc.title, verdict: ok ? "approved" : "rejected" });
    message = `${ok ? "Approved" : "Rejected"} "${doc.title}".` + noteLine;
    headline = ok ? "Approved" : "Rejected";
  } else {
    const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, block: g.block.id, v: picks[pickKey(g.block.id, i.id)] })));
    for (const i of all) rows.push({ id: i.id, label: i.label, block: i.block, verdict: i.v === "ok" ? "approved" : i.v === "no" ? "rejected" : "unreviewed" });
    const ok = all.filter((i) => i.v === "ok");
    const no = all.filter((i) => i.v === "no");
    const rest = all.filter((i) => !i.v);
    const parts = [ok.length && `approved ${ids(ok)}`, no.length && `rejected ${ids(no)}`, rest.length && `not reviewed ${ids(rest)}`].filter(Boolean);
    message = `Review of "${doc.title}": ${parts.join("; ")}.` + noteLine;
    headline = `${ok.length} approved · ${no.length} rejected`;
  }
  return { message, headline, record: { title: doc.title, question: doc.question, type, picks: rows, note: trimmed || undefined, message } };
}

export function askMessage(doc: Doc, label: string, id: string | undefined, question: string): string {
  return `About "${label}"${id ? ` (id: ${id})` : ""} in "${doc.title}": ${question.trim()}`;
}
