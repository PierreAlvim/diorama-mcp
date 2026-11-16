import { answerables } from "../../shared/lint";
import type { Block, Decision, DecisionRecord, Markers, Response, View } from "../../shared/schema";

export type Doc = View | Decision;
export type El = Markers & { id?: string };
export type Emph = "on" | "off" | "neutral";

export const isDecision = (d: Doc): d is Decision => "response" in d && !!d.response;

/** The host forwards raw tool arguments, so nothing has been validated or defaulted on this side. */
export function normalize(raw: unknown): Doc | null {
  const d = raw as Partial<Decision> | null;
  if (!d || !Array.isArray(d.blocks) || d.blocks.length === 0) return null;
  return { ...d, title: d.title ?? "", blocks: d.blocks.filter((b) => b && typeof b.type === "string") } as Doc;
}

/** Every element that can carry markers, with the block it lives in. */
export function elements(doc: Doc): El[] {
  const out: El[] = [];
  for (const b of doc.blocks) {
    if (b.type === "cards" || b.type === "steps" || b.type === "quadrant") out.push(...b.items);
    else if (b.type === "graph") out.push(...b.nodes, ...b.edges);
    else if (b.type === "tree") out.push(...b.nodes);
    else if (b.type === "matrix") out.push(...b.rows, ...b.rows.flatMap((r) => r.cells.filter((c): c is Exclude<typeof c, string> => typeof c === "object")));
    else if (b.type === "board") out.push(...b.columns.flatMap((c) => c.items));
    else if (b.type === "sequence") out.push(...b.messages);
    else if (b.type === "timeline") out.push(...b.tracks, ...b.tracks.flatMap((t) => t.phases), ...(b.events ?? []));
    else if (b.type === "tradeoff") out.push(...b.items);
  }
  return out;
}

export interface Links {
  /** Ids that act as a lens: declared lenses and anything named by an `in`. */
  lens: Set<string>;
  /** Ids worth highlighting on hover: they point at, are pointed at by, or repeat as another element. */
  linked: Set<string>;
  /** id -> ids it references. */
  refs: Map<string, string[]>;
}

export function links(doc: Doc): Links {
  const lens = new Set((doc.lenses ?? []).map((l) => l.id));
  const linked = new Set<string>();
  const refs = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const el of elements(doc)) {
    for (const l of el.in ?? []) lens.add(l);
    if (el.id) {
      if (seen.has(el.id)) linked.add(el.id);
      seen.add(el.id);
      if (el.refs?.length) {
        linked.add(el.id);
        refs.set(el.id, [...(refs.get(el.id) ?? []), ...el.refs]);
      }
    }
    for (const r of el.refs ?? []) linked.add(r);
  }
  return { lens, linked, refs };
}

export type Focus =
  | { kind: "none" }
  /** A perspective: members light up, elements of other lenses fade, common elements stay. */
  | { kind: "lens"; id: string }
  /** A spotlight: everything outside it fades. `source` is the hovered element, if any. */
  | { kind: "spot"; ids: Set<string>; source?: string };

export function emphasis(el: El & { from?: string; to?: string }, focus: Focus, isEdge = false): Emph {
  if (focus.kind === "none") return "neutral";
  if (focus.kind === "lens") {
    if (el.id === focus.id) return "on";
    if (!el.in) return "neutral";
    return el.in.includes(focus.id) ? "on" : "off";
  }
  if (el.id && focus.ids.has(el.id)) return "on";
  if (el.in?.some((l) => focus.ids.has(l))) return "on";
  if (focus.source && el.refs?.includes(focus.source)) return "on";
  if (isEdge && !el.in && el.from && el.to && focus.ids.has(el.from) && focus.ids.has(el.to)) return "on";
  return "off";
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
