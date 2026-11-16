import { useCallback, useMemo, useState } from "react";
import { applyState, initialState, stateful, states } from "../../shared/state";
import type { Block, DecisionRecord } from "../../shared/schema";
import { Blocks } from "./blocks";
import { type BindProps, type Ctx, ViewCtx } from "./ctx";
import { type Doc, type Focus, type Picks, type Verdict, askMessage, buildAnswer, canSubmit, emphasis, isDecision, pickKey, repeated, targetItems, togglePick } from "./model";

/** How the view talks back; implemented by the MCP host bridge and by the standalone preview. */
export interface Host {
  record(rec: DecisionRecord): Promise<void>;
  /** Returns false when the host refused to post the message into the chat. */
  send(text: string): Promise<boolean>;
}

export const PALETTE = ["#4f8ff7", "#e8884a", "#3fb68b", "#b073e0", "#e0607e", "#c9a227"];

type Sent = { kind: "open" } | { kind: "sending" } | { kind: "done"; headline: string; text: string; delivered: boolean } | { kind: "error"; message: string };
type Asking = { id?: string; label: string } | null;

export function App({ doc, host }: { doc: Doc; host: Host }) {
  const decision = isDecision(doc) ? doc : null;
  const stateIds = useMemo(() => new Set(stateful(doc) ? states(doc).map((x) => x.id) : []), [doc]);
  const linked = useMemo(() => repeated(doc), [doc]);
  const groups = useMemo(() => (decision ? targetItems(decision) : []), [decision]);
  const answerable = useMemo(() => new Map(groups.map((g) => [g.block.id, new Set(g.items.map((i) => i.id))])), [groups]);
  const colors = useMemo(() => {
    const ids = [...(doc.lenses ?? []).map((l) => l.id), ...doc.blocks.flatMap((b) => (b.type === "cards" || b.type === "tradeoff" ? b.items.map((i) => i.id) : []))];
    return new Map([...new Set(ids)].map((id, i) => [id, PALETTE[i % PALETTE.length]]));
  }, [doc]);

  const [picks, setPicks] = useState<Picks>({});
  const [hover, setHover] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(doc.walkthrough?.length ? 0 : null);
  const [selected, setSelected] = useState<string | null>(() => doc.walkthrough?.[0]?.state ?? initialState(doc));
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<Sent>({ kind: "open" });
  const [asking, setAsking] = useState<Asking>(null);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<{ text: string; delivered: boolean } | null>(null);
  const locked = sent.kind === "sending" || sent.kind === "done";

  // State and spotlight are independent: the state says what each element is, the spotlight says where to look.
  // Hovering something that is a state (a card, a lens) previews it; hovering anything else spotlights its other appearances.
  const activeState = hover && stateIds.has(hover) && !locked ? hover : selected;
  const focus: Focus = useMemo(() => {
    if (hover && !locked && !stateIds.has(hover) && linked.has(hover)) return { state: activeState, spot: { ids: new Set([hover]), strict: false } };
    const ids = step !== null ? doc.walkthrough?.[step]?.focus : undefined;
    return ids?.length ? { state: activeState, spot: { ids: new Set(ids), strict: true } } : { state: activeState };
  }, [hover, locked, stateIds, linked, activeState, step, doc]);
  const shown = useMemo(() => applyState(doc, activeState), [doc, activeState]);

  const go = (n: number) => {
    setStep(n);
    const next = doc.walkthrough?.[n]?.state;
    if (next) setSelected(next);
  };

  const pick = useCallback(
    (blockId: string, itemId: string, value?: "ok" | "no") => {
      if (!decision || locked) return;
      setPicks((p) => togglePick(decision, p, blockId, itemId, value));
      // Choosing an option also switches the view to it.
      if (decision.response.type === "choose_one" && stateIds.has(itemId)) setSelected(itemId);
    },
    [decision, locked, stateIds],
  );

  const ctx: Ctx = useMemo(() => {
    const answer: Ctx["answer"] = (block: Block, itemId: string) => {
      if (!decision || !block.id || !answerable.get(block.id)?.has(itemId)) return null;
      const blockId = block.id;
      return { type: decision.response.type, value: picks[pickKey(blockId, itemId)], set: (v) => pick(blockId, itemId, v) };
    };
    return {
      activeState,
      locked,
      answer,
      color: (id) => colors.get(id),
      emph: (el, isEdge) => emphasis(el, focus, isEdge),
      bind(el, opts = {}) {
        const e = emphasis({ ...el, from: opts.from, to: opts.to }, focus, opts.edge);
        const a = el.id && opts.block ? answer(opts.block, el.id) : null;
        const props: BindProps = { className: `el ${e}${a?.value ? " picked" : ""}`, "data-id": el.id, "data-change": el.change, "data-status": el.status };
        const color = el.id ? colors.get(el.id) : undefined;
        if (color) props.style = { "--opt": color } as React.CSSProperties;
        if (el.id) {
          const id = el.id;
          props.onMouseEnter = () => setHover(id);
          props.onMouseLeave = () => setHover((h) => (h === id ? null : h));
        }
        const activate = a && a.type !== "approve" ? () => a.set() : opts.label ? () => (setAsked(null), setAsking({ id: el.id, label: opts.label! })) : null;
        if (activate && !locked) {
          props.className += " clickable";
          props.onClick = (ev) => (ev.stopPropagation(), activate());
          props.onKeyDown = (ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), activate());
          props.tabIndex = 0;
          props.role = "button";
          if (a) props["aria-pressed"] = !!a.value;
        }
        return props;
      },
    };
  }, [activeState, locked, colors, focus, decision, answerable, picks, pick]);

  async function submit(verdict?: Verdict) {
    if (!decision) return;
    const { message, record, headline } = buildAnswer(decision, picks, note, verdict);
    setSent({ kind: "sending" });
    try {
      await host.record(record);
      setSent({ kind: "done", headline, text: message, delivered: await host.send(message) });
    } catch (err) {
      setSent({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function ask() {
    if (!asking || !question.trim()) return;
    const text = askMessage(doc, asking.label, asking.id, question);
    setAsked({ text, delivered: await host.send(text) });
    setQuestion("");
  }

  function approveAll() {
    setPicks(Object.fromEntries(groups.flatMap((g) => g.items.map((i) => [pickKey(g.block.id, i.id), "ok"]))));
  }

  const type = decision?.response.type;
  const perItem = groups.length > 0;
  const chosen = groups.length === 1 ? groups[0].items.find((i) => picks[pickKey(groups[0].block.id, i.id)]) : undefined;
  const count = Object.keys(picks).length;
  const primary =
    type === "choose_one"
      ? groups.length > 1
        ? `Confirm ${count} of ${groups.length} choices`
        : chosen
          ? `Confirm: ${chosen.label}`
          : "Select an option"
      : type === "choose_many"
        ? `Confirm selection (${count})`
        : perItem
          ? "Submit review"
          : "Approve";
  const walk = doc.walkthrough;

  return (
    <ViewCtx.Provider value={ctx}>
      <div className="wrap" style={{ "--opt": (activeState && colors.get(activeState)) || "var(--accent)" } as React.CSSProperties}>
        <header>
          <h1>{doc.title}</h1>
          {doc.context && <p className="context">{doc.context}</p>}
          {decision && <p className="question">{decision.question}</p>}
        </header>

        {doc.lenses && doc.lenses.length > 0 && (
          <div className="lenses" role="group" aria-label="Lens">
            <span className="muted">Lens</span>
            {doc.lenses.map((l) => (
              <button
                key={l.id}
                type="button"
                className="chip-btn"
                style={{ "--opt": colors.get(l.id) } as React.CSSProperties}
                aria-pressed={selected === l.id}
                onClick={() => setSelected(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        <Blocks blocks={shown.blocks} />

        {walk && walk.length > 0 && step !== null && (
          <div className="walk">
            <b>Step {step + 1} of {walk.length}</b>
            <p>{walk[step].text}</p>
            <span className="walk-nav">
              <button type="button" aria-label="Previous step" disabled={step === 0} onClick={() => go(step - 1)}>‹</button>
              <button type="button" aria-label="Next step" disabled={step === walk.length - 1} onClick={() => go(step + 1)}>›</button>
            </span>
          </div>
        )}

        {asking && (
          <div className="ask">
            <b>Ask about “{asking.label}”</b>
            {asked ? (
              asked.delivered ? <p className="muted">Sent to the chat.</p> : <><p className="muted">The chat did not accept the message. Paste this into the chat:</p><pre>{asked.text}</pre></>
            ) : (
              // Not a <form>: hosts sandbox the view without allow-forms, which blocks submit events.
              <div className="ask-row">
                <input autoFocus value={question} placeholder="What do you want to know?" onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void ask()} />
                <button type="button" className="primary" disabled={!question.trim()} onClick={() => void ask()}>Ask</button>
              </div>
            )}
            <button type="button" className="close" aria-label="Close" onClick={() => setAsking(null)}>×</button>
          </div>
        )}

        {decision &&
          (sent.kind === "done" ? (
            <div className="done">
              <b>{sent.headline}</b>
              {sent.delivered ? <p className="muted">Sent to the chat and recorded.</p> : <><p className="muted">Recorded, but the chat did not accept the message. Paste this into the chat:</p><pre>{sent.text}</pre></>}
            </div>
          ) : (
            <div className="footer">
              <textarea placeholder="Optional note: constraints, why, what to adjust…" value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} />
              <div className="actions">
                <button type="button" className="primary" disabled={locked || !canSubmit(decision, picks)} onClick={() => submit(type === "approve" && !perItem ? "approved" : undefined)}>
                  {primary}
                </button>
                {type === "choose_one" && groups.length === 1 && <button type="button" className="secondary" disabled={locked} onClick={() => submit("none")}>None of these</button>}
                {type === "approve" && perItem && <button type="button" className="secondary" disabled={locked} onClick={approveAll}>Approve all</button>}
                {type === "approve" && !perItem && <button type="button" className="secondary" disabled={locked} onClick={() => submit("rejected")}>Reject</button>}
                {type === "approve" && perItem && count > 0 && <span className="muted tally">{buildAnswer(decision, picks, "").headline}</span>}
                {sent.kind === "error" && <span className="error">Failed: {sent.message}</span>}
              </div>
            </div>
          ))}
        {!decision && !asking && <p className="hint muted">Click an element to ask about it.</p>}
      </div>
    </ViewCtx.Provider>
  );
}
