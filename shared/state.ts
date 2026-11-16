import type { Block, Decision, Markers, Props, View } from "./schema.js";

/**
 * States: the one mechanism by which elements relate to the rest of the view.
 *
 * A view has named states: its lenses and the items of its cards blocks. While a state is active, every element
 * is its base properties overridden by `when[state]`. That is the whole model; there is no membership or reference.
 */

type Doc = View | Decision;
export type El = Markers & { id?: string };
export interface State {
  id: string;
  label: string;
  kind: "lens" | "card";
}

/** Lenses first, then cards, in the order written. */
export function states(doc: Doc): State[] {
  const out: State[] = (doc.lenses ?? []).map((l) => ({ id: l.id, label: l.label, kind: "lens" }));
  for (const b of doc.blocks) if (b.type === "cards") for (const c of b.items) out.push({ id: c.id, label: c.title, kind: "card" });
  return out.filter((s, i) => out.findIndex((o) => o.id === s.id) === i);
}

/** Calls `fn` on every element that can carry properties and rebuilds the block around the results. */
function mapBlock(b: Block, fn: <T extends El>(el: T) => T): Block {
  switch (b.type) {
    case "cards":
    case "steps":
    case "quadrant":
      return { ...b, items: b.items.map(fn) } as Block;
    case "graph":
      return { ...b, nodes: b.nodes.map(fn), edges: b.edges.map(fn) };
    case "tree":
      return { ...b, nodes: b.nodes.map(fn) };
    case "matrix":
      return { ...b, rows: b.rows.map((r) => ({ ...fn(r), cells: r.cells.map((c) => (typeof c === "string" ? c : fn(c))) })) };
    case "board":
      return { ...b, columns: b.columns.map((c) => ({ ...c, items: c.items.map(fn) })) };
    case "sequence":
      return { ...b, messages: b.messages.map(fn) };
    case "timeline":
      return { ...b, tracks: b.tracks.map((t) => ({ ...fn(t), phases: t.phases.map(fn) })), events: b.events?.map(fn) };
    default:
      return b;
  }
}

/** Every element that can carry properties. */
export function elements(doc: Doc): El[] {
  const out: El[] = [];
  for (const b of doc.blocks) mapBlock(b, (el) => (out.push(el), el));
  return out;
}

/**
 * Whether states do anything in this view: some element varies by state, or a lens was declared.
 * A plain list of option cards has states in name only, and nothing should look "active" before the user chooses.
 */
export function stateful(doc: Doc): boolean {
  if (doc.lenses?.length) return true;
  const ids = new Set(states(doc).map((s) => s.id));
  if (!ids.size) return false;
  if (elements(doc).some((el) => el.when && Object.keys(el.when).length > 0)) return true;
  // An element that reuses a state's id is that option seen in another block (a tradeoff item, a timeline track).
  return doc.blocks.some((b) => (b.type === "tradeoff" ? b.items : b.type === "timeline" ? b.tracks : []).some((x) => ids.has(x.id)));
}

/** The state a view opens in: the recommended card, otherwise the first state. Null when states are not in play. */
export function initialState(doc: Doc): string | null {
  if (!stateful(doc)) return null;
  for (const b of doc.blocks) if (b.type === "cards") for (const c of b.items) if (c.recommended) return c.id;
  return states(doc)[0]?.id ?? null;
}

/** An element as it is while `state` is active. */
export function inState<T extends El>(el: T, state: string | null): T {
  // Validated by lint before a view is shown, so the loose record is known to hold properties.
  const over = (state ? el.when?.[state] : undefined) as Props | undefined;
  return over ? { ...el, ...over } : el;
}

/** The whole view as it is while `state` is active. Blocks render this and never look at `when`. */
export function applyState<D extends Doc>(doc: D, state: string | null): D {
  if (!state) return doc;
  return { ...doc, blocks: doc.blocks.map((b) => mapBlock(b, (el) => inState(el, state))) };
}
