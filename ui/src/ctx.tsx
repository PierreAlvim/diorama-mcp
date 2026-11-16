import { createContext, useContext, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { Block, Change, Status } from "../../shared/schema";
import type { El, Emph } from "./model";

/** What blocks need from the app: emphasis, hover/click wiring and answer controls. */
export interface Ctx {
  emph(el: El & { from?: string; to?: string }, isEdge?: boolean): Emph;
  /** Props that make an element take part in highlighting, asking and answering. */
  bind(el: El, opts?: { block?: Block; label?: string; edge?: boolean; from?: string; to?: string }): BindProps;
  /** Answer state of an item, when its block is the one being answered on. */
  answer(block: Block, itemId: string): { type: "choose_one" | "choose_many" | "approve"; value?: string; set(v?: "ok" | "no"): void } | null;
  color(id: string): string | undefined;
  /** The state the view is in, or null when states are not in play. */
  activeState: string | null;
  locked: boolean;
}

export interface BindProps {
  className: string;
  style?: CSSProperties;
  "data-id"?: string;
  "data-change"?: Change;
  "data-status"?: Status;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: (e: MouseEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  tabIndex?: number;
  role?: string;
  "aria-pressed"?: boolean;
}

export const ViewCtx = createContext<Ctx>(null as unknown as Ctx);
export const useView = () => useContext(ViewCtx);

export const withClass = (p: BindProps, extra: string): BindProps => ({ ...p, className: `${p.className} ${extra}` });

const GLYPH: Record<Change, string> = { added: "+", removed: "−", changed: "~", affected: "!" };

/** Small marker for `change` or `status`. Returns null when the element has neither. */
export function Mark({ el }: { el: El }) {
  if (el.change) return <span className="mark" data-change={el.change} title={el.change}>{GLYPH[el.change]}</span>;
  if (el.status) return <span className="dot" data-status={el.status} title={el.status} />;
  return null;
}

/** Same markers inside an SVG, centred on (x, y). */
export function SvgMark({ el, x, y }: { el: El; x: number; y: number }) {
  if (el.change)
    return (
      <g className="svg-mark" data-change={el.change}>
        <circle cx={x} cy={y} r="7" />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central">{GLYPH[el.change]}</text>
      </g>
    );
  if (el.status) return <circle className="svg-dot" data-status={el.status} cx={x} cy={y} r="4.5" />;
  return null;
}

/** Radio, checkbox or approve/reject pair for an answerable item. */
export function Control({ block, id }: { block: Block; id: string }) {
  const { answer, locked } = useView();
  const a = answer(block, id);
  if (!a) return null;
  if (a.type === "approve")
    return (
      <span className="verdict">
        <button type="button" className="ok" aria-label="Approve" aria-pressed={a.value === "ok"} disabled={locked} onClick={(e) => (e.stopPropagation(), a.set("ok"))}>✓</button>
        <button type="button" className="no" aria-label="Reject" aria-pressed={a.value === "no"} disabled={locked} onClick={(e) => (e.stopPropagation(), a.set("no"))}>✗</button>
      </span>
    );
  return <span className={a.type === "choose_one" ? "radio" : "check"} data-on={a.value ? "" : undefined} aria-hidden />;
}

export function BlockFrame({ block, children, className = "" }: { block: Block; children: React.ReactNode; className?: string }) {
  return (
    <section className={`block b-${block.type} ${className}`} data-block={block.id}>
      {block.label && <h2>{block.label}</h2>}
      {children}
    </section>
  );
}
