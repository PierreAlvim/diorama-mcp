import { createContext, useContext, type ReactNode } from "react";

/**
 * A form derived from the tool's JSON Schema. Nothing here knows about blocks: a new block or field in shared/schema.ts shows up by itself.
 * The form edits the same value the JSON tab shows; neither is a copy of the other.
 */

export interface JS {
  type?: string;
  properties?: Record<string, JS>;
  required?: string[];
  items?: JS;
  enum?: (string | number)[];
  const?: unknown;
  oneOf?: JS[];
  anyOf?: JS[];
  description?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}

interface FormCtx {
  /** Paths (`blocks[1].edges[0].to`) that failed validation on the last update. */
  errors: Set<string>;
  /** Ready-made values for members of a discriminated union, by discriminator value. */
  templates: Record<string, unknown>;
}
const Ctx = createContext<FormCtx>({ errors: new Set(), templates: {} });

/** Marker fields carry no description in the schema (they would repeat on every element), so the form explains them once. */
const HINTS: Record<string, string> = {
  in: "Lens or card ids this element belongs to. Leave out for elements common to all.",
  refs: "Ids of related elements in other blocks; focusing one highlights the others.",
  change: "Diff marker.",
  status: "State marker.",
  note: "One short line shown next to the element.",
  id: "Ids are global: the same id in two blocks means the same thing.",
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const variants = (s: JS) => s.oneOf ?? s.anyOf;
const discriminator = (s: JS) => s.properties?.type?.const as string | undefined;
const kindOf = (v: unknown) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "number" ? "number" : typeof v);
const accepts = (s: JS, v: unknown) => s.type === kindOf(v) || (s.type === "integer" && typeof v === "number");

/** The union member that describes `value`, or the first one. */
function pick(s: JS, value: unknown): JS {
  const all = variants(s);
  if (!all) return s;
  const byTag = isObj(value) ? all.find((v) => discriminator(v) !== undefined && discriminator(v) === value.type) : undefined;
  return byTag ?? all.find((v) => accepts(v, value)) ?? all[0];
}

/** The emptiest value that still has every required field, so that a new item is immediately editable. */
export function initial(s: JS, templates: Record<string, unknown> = {}): unknown {
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  const all = variants(s);
  if (all) return templates[discriminator(all[0]) ?? ""] ?? initial(all[0], templates);
  switch (s.type) {
    case "object":
      return Object.fromEntries((s.required ?? []).map((k) => [k, initial(s.properties![k], templates)]));
    case "array":
      return Array.from({ length: s.minItems ?? 0 }, () => initial(s.items!, templates));
    case "number":
    case "integer":
      return s.minimum ?? 0;
    case "boolean":
      return false;
    default:
      return "";
  }
}

const isSimple = (s: JS, value: unknown): boolean => {
  const v = pick(s, value);
  return v.type !== "object" && v.type !== "array";
};
const at = (path: string, key: string | number) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key);

function summary(v: unknown): string {
  if (!isObj(v)) return String(v ?? "");
  const main = [v.label, v.title, v.text, v.v].find((x) => typeof x === "string" && x) as string | undefined;
  const from = typeof v.from === "string" && typeof v.to === "string" ? `${v.from} → ${v.to}` : typeof v.item === "string" && typeof v.axis === "string" ? `${v.item} × ${v.axis}` : undefined;
  return [typeof v.type === "string" ? v.type : undefined, typeof v.id === "string" ? v.id : undefined, from, main].filter(Boolean).join(" · ") || "(empty)";
}

function Primitive({ schema, value, onChange, path }: { schema: JS; value: unknown; onChange: (v: unknown) => void; path: string }) {
  const { errors } = useContext(Ctx);
  const common = { "data-path": path, "aria-invalid": errors.has(path) || undefined };
  if (schema.enum)
    return (
      <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {value === undefined && <option value="">—</option>}
        {schema.enum.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  if (schema.type === "boolean") return <input {...common} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  if (schema.type === "number" || schema.type === "integer")
    return <input {...common} type="number" min={schema.minimum} max={schema.maximum} step={schema.type === "integer" ? 1 : "any"} value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
  return <input {...common} type="text" value={typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value)} onChange={(e) => onChange(e.target.value)} />;
}

/** One value of any shape. `tools` are the buttons the parent wants next to it (remove, move). */
function Field({ schema, value, onChange, path, tools }: { schema: JS; value: unknown; onChange: (v: unknown) => void; path: string; tools?: ReactNode }) {
  const { templates } = useContext(Ctx);
  const all = variants(schema);
  const chosen = pick(schema, value);

  let switcher: ReactNode = null;
  if (all && all.every((v) => discriminator(v) !== undefined)) {
    // Discriminated union: changing the tag replaces the value, since the fields have nothing in common.
    switcher = (
      <select className="tag" data-path={at(path, "type")} value={discriminator(chosen)} onChange={(e) => onChange(templates[e.target.value] ?? initial(all.find((v) => discriminator(v) === e.target.value)!, templates))}>
        {all.map((v) => <option key={discriminator(v)}>{discriminator(v)}</option>)}
      </select>
    );
  } else if (all) {
    const label = (v: JS) => (v.type === "string" ? "text" : v.type === "array" ? "list" : v.type === "object" ? "detailed" : v.type ?? "?");
    const convert = (to: JS) => {
      if (to.type === "object" && typeof value === "string") return { ...(initial(to, templates) as Obj), [to.required?.[0] ?? "v"]: value };
      if (to.type === "string" && isObj(value)) return String(value[chosen.required?.[0] ?? "v"] ?? "");
      if (to.type === "array") return typeof value === "string" && value ? [value] : initial(to, templates);
      if (to.type === "string" && Array.isArray(value)) return String(value[0] ?? "");
      return initial(to, templates);
    };
    switcher = (
      <select className="tag" value={all.indexOf(chosen)} onChange={(e) => onChange(convert(all[Number(e.target.value)]))}>
        {all.map((v, i) => <option key={i} value={i}>{label(v)}</option>)}
      </select>
    );
  }

  if (chosen.type === "object") return <ObjectField schema={chosen} value={isObj(value) ? value : {}} onChange={onChange} path={path} head={<>{switcher}{tools}</>} />;
  if (chosen.type === "array") return <ArrayField schema={chosen} value={Array.isArray(value) ? value : []} onChange={onChange} path={path} head={<>{switcher}{tools}</>} />;
  return <span className="prim"><Primitive schema={chosen} value={value} onChange={onChange} path={path} />{switcher}{tools}</span>;
}

function ObjectField({ schema, value, onChange, path, head }: { schema: JS; value: Obj; onChange: (v: unknown) => void; path: string; head?: ReactNode }) {
  const { templates } = useContext(Ctx);
  const props = Object.entries(schema.properties ?? {}).filter(([, s]) => s.const === undefined);
  const required = new Set(schema.required ?? []);
  /** Keys come out in schema order, whatever order they were added in. */
  const set = (key: string, v: unknown) => {
    const next: Obj = {};
    for (const k of Object.keys(schema.properties ?? {})) {
      const val = k === key ? v : value[k];
      if (val !== undefined) next[k] = val;
    }
    for (const k of Object.keys(value)) if (!(k in next) && k !== key && !(k in (schema.properties ?? {}))) next[k] = value[k];
    onChange(next);
  };
  const shown = props.filter(([k]) => required.has(k) || value[k] !== undefined);
  const absent = props.filter(([k]) => !required.has(k) && value[k] === undefined);
  const remove = (k: string) => !required.has(k) && <button type="button" className="x" title={`Remove ${k}`} aria-label={`Remove ${k}`} onClick={() => set(k, undefined)}>×</button>;
  const hint = (k: string, s: JS) => s.description ?? HINTS[k];

  return (
    <div className="obj" data-path={path}>
      {head && <div className="head">{head}</div>}
      <div className="grid">
        {shown.filter(([k, s]) => isSimple(s, value[k])).map(([k, s]) => (
          <label key={k} className={`f${s.type === "boolean" ? " bool" : ""}${/^(title|context|summary|text|question|reason|detail)$/.test(k) ? " wide" : ""}`} title={hint(k, s)}>
            <span className="k">{k}{required.has(k) && <i>*</i>}</span>
            <Field schema={s} value={value[k]} onChange={(v) => set(k, v)} path={at(path, k)} tools={remove(k)} />
          </label>
        ))}
      </div>
      {shown.filter(([k, s]) => !isSimple(s, value[k])).map(([k, s]) => (
        <section key={k} className="group">
          <header><span className="k">{k}{required.has(k) && <i>*</i>}</span>{hint(k, s) && <span className="hint">{hint(k, s)}</span>}</header>
          <Field schema={s} value={value[k]} onChange={(v) => set(k, v)} path={at(path, k)} tools={remove(k)} />
        </section>
      ))}
      {absent.length > 0 && (
        <div className="chips">
          {absent.map(([k, s]) => <button key={k} type="button" className="chip" title={hint(k, s)} onClick={() => set(k, initial(s, templates))}>+ {k}</button>)}
        </div>
      )}
    </div>
  );
}

function ArrayField({ schema, value, onChange, path, head }: { schema: JS; value: unknown[]; onChange: (v: unknown) => void; path: string; head?: ReactNode }) {
  const { errors, templates } = useContext(Ctx);
  const item = schema.items ?? {};
  const full = schema.maxItems !== undefined && value.length >= schema.maxItems;
  const replace = (i: number, v: unknown) => onChange(value.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const tools = (i: number) => (
    <span className="tools">
      <button type="button" className="x" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" className="x" title="Move down" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
      <button type="button" className="x" title="Remove" aria-label="Remove item" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
    </span>
  );
  const tags = variants(item)?.map(discriminator).filter((t): t is string => !!t) ?? [];
  const broken = (p: string) => [...errors].some((e) => e === p || e.startsWith(`${p}.`) || e.startsWith(`${p}[`));

  return (
    <div className="arr" data-path={path}>
      {head && <div className="head">{head}</div>}
      {value.map((v, i) => {
        const p = at(path, i);
        if (isSimple(item, v)) return <div key={i} className="row"><Field schema={item} value={v} onChange={(x) => replace(i, x)} path={p} tools={tools(i)} /></div>;
        return (
          <details key={i} className={broken(p) ? "bad" : undefined}>
            <summary><span className="n">{i + 1}</span><span className="s">{summary(v)}</span>{tools(i)}</summary>
            <Field schema={item} value={v} onChange={(x) => replace(i, x)} path={p} />
          </details>
        );
      })}
      {tags.length > 0 ? (
        <select className="add" disabled={full} value="" aria-label={`Add to ${path}`} onChange={(e) => e.target.value && onChange([...value, templates[e.target.value] ?? initial(variants(item)!.find((v) => discriminator(v) === e.target.value)!, templates)])}>
          <option value="">{full ? `max ${schema.maxItems}` : "+ add…"}</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
      ) : (
        <button type="button" className="add" disabled={full} onClick={() => onChange([...value, initial(item, templates)])}>{full ? `max ${schema.maxItems}` : "+ add"}</button>
      )}
    </div>
  );
}

export function SchemaForm({ schema, value, onChange, errors, templates }: { schema: JS; value: unknown; onChange: (v: unknown) => void; errors: Set<string>; templates: Record<string, unknown> }) {
  return (
    <Ctx.Provider value={{ errors, templates }}>
      <div className="form"><ObjectField schema={schema} value={isObj(value) ? value : {}} onChange={onChange} path="" /></div>
    </Ctx.Provider>
  );
}
