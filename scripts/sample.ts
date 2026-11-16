import type { Decision } from "../shared/schema.js";
import { type Picks, pickKey, targets } from "../ui/src/model.js";

/** Example state of a scenario: what the user has clicked in the wireframe and in the e2e run. */
export interface Sample {
  lens?: string;
  step?: number;
  hover?: string;
  /** choose_one on a single block. */
  pick?: string;
  /** choose_many: {itemId: true}; approve: {itemId: "ok" | "no"}; choose_one on several blocks: {blockId: itemId}. */
  picks?: Record<string, string | boolean>;
  note?: string;
  summary?: string;
}

export interface Scenario {
  slug: string;
  group: string;
  title: string;
  tool: "present_view" | "present_decision";
  args: Record<string, unknown>;
  sample?: Sample;
  [key: string]: unknown;
}

/** Translates a scenario's sample into the view's pick state. */
export function samplePicks(doc: Decision, sample: Sample = {}): Picks {
  const of = targets(doc.response);
  const out: Picks = {};
  if (of.length === 0) return out;
  if (doc.response.type === "choose_one") {
    if (of.length === 1 && sample.pick) out[pickKey(of[0], sample.pick)] = "one";
    else for (const [block, item] of Object.entries(sample.picks ?? {})) out[pickKey(block, String(item))] = "one";
  } else {
    for (const [item, v] of Object.entries(sample.picks ?? {})) if (v) out[pickKey(of[0], item)] = doc.response.type === "choose_many" ? "yes" : String(v);
  }
  return out;
}
