import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import a from "../../docs/scenarios/data-a.mjs";
import b from "../../docs/scenarios/data-b.mjs";
import { check, type Outcome, type PresentTool } from "../../shared/present";
import { DecisionSchema, ViewSchema, type DecisionRecord } from "../../shared/schema";
import { SchemaForm, type JS } from "./Form";
import type { FromFrame, ToFrame } from "./protocol";
import { pack, unpack } from "./share";
import { BLOCK_TYPES, STARTERS, TEMPLATES } from "./templates";
import "./playground.css";

const SCENARIOS = [...a, ...b];
const SCHEMAS: Record<PresentTool, JS> = { present_view: z.toJSONSchema(ViewSchema) as JS, present_decision: z.toJSONSchema(DecisionSchema) as JS };
const WIDTHS = [{ label: "Narrow", px: 380 }, { label: "Chat", px: 600 }, { label: "Wide", px: 860 }, { label: "Fill", px: 0 }];

type Call = { tool: PresentTool; arguments: unknown };
type Parsed = { ok: true; call: Call } | { ok: false; error: string };
type Applied = { text: string; call: Call; outcome: Outcome; run: number };
type Theme = "light" | "dark";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const show = (call: Call) => JSON.stringify(call, null, 2);

/** Accepts the envelope (`{tool, arguments}`, or `name` as MCP logs print it) or bare arguments, where the tool follows from whether there is a `response`. */
function parse(text: string): Parsed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!isObj(raw)) return { ok: false, error: "Expected a JSON object." };
  const name = raw.tool ?? raw.name;
  if ("arguments" in raw && typeof name === "string") {
    if (name !== "present_view" && name !== "present_decision") return { ok: false, error: `Unknown tool "${name}". Use present_view or present_decision.` };
    return { ok: true, call: { tool: name, arguments: raw.arguments } };
  }
  return { ok: true, call: { tool: "response" in raw ? "present_decision" : "present_view", arguments: raw } };
}

function scenarioCall(i: number): Call {
  const s = SCENARIOS[Math.min(SCENARIOS.length - 1, Math.max(0, i))];
  return { tool: s.tool as PresentTool, arguments: s.args };
}

function Playground() {
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [source, setSource] = useState("");
  const [tab, setTab] = useState<"form" | "json">("form");
  const [width, setWidth] = useState(600);
  const [theme, setTheme] = useState<Theme>(() => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [height, setHeight] = useState(200);
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [shared, setShared] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const runs = useRef(0);

  const parsed = useMemo(() => parse(text), [text]);
  const dirty = applied?.text !== text;

  const apply = useCallback((t: string) => {
    const p = parse(t);
    if (!p.ok) return;
    setApplied({ text: t, call: p.call, outcome: check(p.call.tool, p.call.arguments), run: ++runs.current });
    setSent([]);
    setRecords([]);
  }, []);
  const load = useCallback((call: Call, from: string) => {
    const t = show(call);
    setText(t);
    setSource(from);
    setShared("");
    apply(t);
  }, [apply]);

  // What to open with: a shared payload, a scenario number, or the first scenario.
  useEffect(() => {
    const open = async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const packed = hash.get("p");
      if (packed) {
        try {
          const p = parse(JSON.stringify(await unpack(packed)));
          if (p.ok) return load(p.call, "");
        } catch {
          /* a damaged link falls through to the default */
        }
      }
      const n = Number(hash.get("s") ?? 1);
      load(scenarioCall(n - 1), String(Math.min(SCENARIOS.length, Math.max(1, n)) - 1));
    };
    void open();
  }, [load]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<FromFrame>) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      if (m.type === "diorama:ready") setReady(true);
      else if (m.type === "diorama:size") setHeight(m.height);
      else if (m.type === "diorama:send") setSent((s) => [...s, m.text]);
      else if (m.type === "diorama:record") setRecords((r) => [...r, m.record]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || !applied) return;
    const msg: ToFrame = { type: "diorama:render", doc: applied.outcome.ok ? applied.outcome.doc : null, theme, run: applied.run };
    frame.current?.contentWindow?.postMessage(msg, location.origin);
  }, [ready, applied, theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && (e.preventDefault(), apply(text));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, text]);

  const edit = (call: Call) => (setText(show(call)), setSource(""), setShared(""));
  const setTool = (tool: PresentTool) => {
    if (!parsed.ok) return;
    const args = isObj(parsed.call.arguments) ? { ...parsed.call.arguments } : {};
    if (tool === "present_decision") Object.assign(args, { question: args.question ?? "", response: args.response ?? { type: "approve" } });
    else (delete args.question, delete args.response);
    edit({ tool, arguments: args });
  };
  const addBlock = (type: string) => {
    if (!parsed.ok || !isObj(parsed.call.arguments)) return;
    const blocks = Array.isArray(parsed.call.arguments.blocks) ? parsed.call.arguments.blocks : [];
    edit({ ...parsed.call, arguments: { ...parsed.call.arguments, blocks: [...blocks, TEMPLATES[type as keyof typeof TEMPLATES]] } });
  };
  const share = async () => {
    if (!parsed.ok) return;
    const url = `${location.origin}${location.pathname}#p=${await pack(parsed.call)}`;
    history.replaceState(null, "", url);
    const copied = await navigator.clipboard?.writeText(url).then(() => true, () => false);
    setShared(copied ? `Link copied (${url.length.toLocaleString()} characters)` : "Link is in the address bar");
  };

  const size = parsed.ok ? JSON.stringify(parsed.call.arguments).length : 0;
  const outcome = applied?.outcome;
  const errors = useMemo(() => new Set(outcome && !outcome.ok && !dirty ? outcome.problems.map((p) => p.path).filter(Boolean) : []), [outcome, dirty]);

  return (
    <div className="pg">
      <header className="top">
        <h1>diorama <span>playground</span></h1>
        <select aria-label="Load a tool call" value={source} onChange={(e) => {
          const v = e.target.value;
          if (v === "view" || v === "decision") load({ tool: `present_${v}`, arguments: STARTERS[`present_${v}`] }, v);
          else if (v !== "") load(scenarioCall(Number(v)), v);
        }}>
          {source === "" && <option value="">Edited tool call</option>}
          <optgroup label="Start from scratch">
            <option value="view">Blank view</option>
            <option value="decision">Blank decision</option>
          </optgroup>
          <optgroup label="Scenarios">
            {SCENARIOS.map((s, i) => <option key={i} value={i}>{i + 1}. {s.title ?? s.slug}</option>)}
          </optgroup>
        </select>
        <span className="grow" />
        {shared && <span className="muted" role="status">{shared}</span>}
        <button type="button" onClick={share} disabled={!parsed.ok}>Copy link</button>
      </header>

      <section className="pane editor">
        <div className="bar">
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "form"} onClick={() => setTab("form")}>Form</button>
            <button type="button" role="tab" aria-selected={tab === "json"} onClick={() => setTab("json")}>JSON</button>
          </div>
          <select aria-label="Tool" value={parsed.ok ? parsed.call.tool : ""} disabled={!parsed.ok} onChange={(e) => setTool(e.target.value as PresentTool)}>
            <option>present_view</option>
            <option>present_decision</option>
          </select>
          <select aria-label="Add block" value="" disabled={!parsed.ok} onChange={(e) => e.target.value && addBlock(e.target.value)}>
            <option value="">+ block…</option>
            {BLOCK_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {tab === "json" && <button type="button" disabled={!parsed.ok} onClick={() => parsed.ok && setText(show(parsed.call))}>Format</button>}
          <span className="grow" />
          <button type="button" className={`primary${dirty ? " dirty" : ""}`} disabled={!parsed.ok} onClick={() => apply(text)} title="Ctrl+Enter">Update preview</button>
        </div>
        <div className="body">
          {tab === "json" ? (
            <textarea className="json" aria-label="Tool call JSON" spellCheck={false} value={text} onChange={(e) => (setText(e.target.value), setSource(""), setShared(""))} />
          ) : parsed.ok ? (
            <SchemaForm schema={SCHEMAS[parsed.call.tool]} value={parsed.call.arguments} onChange={(v) => edit({ ...parsed.call, arguments: v })} errors={errors} templates={TEMPLATES} />
          ) : (
            <p className="muted pad">The JSON does not parse, so there is nothing to build a form from. Fix it in the JSON tab.</p>
          )}
        </div>
        <footer className="status">
          <span className="muted size" title="Size of the arguments as the model has to write them (minified JSON). Tokens are estimated at 4 characters each.">
            {parsed.ok ? `${(size / 1024).toFixed(1)} kB · ~${Math.round(size / 4).toLocaleString()} tokens` : "invalid JSON"}
          </span>
          {!parsed.ok && <span className="problem" role="alert">{parsed.error}</span>}
        </footer>
      </section>

      <section className="pane preview">
        <div className="bar">
          <span className="muted">Width</span>
          <div className="seg">
            {WIDTHS.map((w) => <button key={w.label} type="button" aria-pressed={width === w.px} onClick={() => setWidth(w.px)}>{w.label}{w.px ? ` ${w.px}` : ""}</button>)}
          </div>
          <span className="muted">Theme</span>
          <div className="seg">
            {(["light", "dark"] as const).map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}
          </div>
          <span className="grow" />
          {dirty && applied && <span className="muted stale">preview is behind the editor</span>}
        </div>
        <div className="body stage" data-theme={theme}>
          {outcome && !outcome.ok && <p className="notshown">The view was not shown. A chat host would display nothing here; the model gets the tool result below.</p>}
          <iframe
            ref={frame}
            title="View"
            src="./frame.html"
            sandbox="allow-scripts allow-same-origin"
            hidden={!!outcome && !outcome.ok}
            style={{ width: width ? `${width}px` : "100%", height: `${height}px` }}
          />
        </div>
        <div className="out">
          <section data-out="result" className={outcome && !outcome.ok ? "fail" : undefined}>
            <h2>Tool result <span>what the model reads back</span></h2>
            <pre>{outcome?.text ?? ""}</pre>
          </section>
          <section data-out="chat">
            <h2>Chat message <span>sent as the user when they answer or ask</span></h2>
            {sent.length ? sent.map((t, i) => <pre key={i}>{t}</pre>) : <p className="muted">{outcome?.ok ? ("response" in outcome.doc ? "Answer in the view to see it." : "Click an element in the view and ask about it.") : "—"}</p>}
          </section>
          <section data-out="record">
            <h2>record_decision <span>appended to .diorama/decisions.jsonl</span></h2>
            {records.length ? records.map((r, i) => <pre key={i}>{JSON.stringify(r, null, 2)}</pre>) : <p className="muted">—</p>}
          </section>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Playground />);
