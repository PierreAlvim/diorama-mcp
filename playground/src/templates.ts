import type { Block } from "../../shared/schema";
import type { PresentTool } from "../../shared/present";

/** The smallest useful example of each block. Ids are prefixed so that adding two blocks does not link them by accident. */
export const TEMPLATES: Record<Block["type"], Block> = {
  cards: {
    type: "cards",
    id: "options",
    items: [
      { id: "opt-a", title: "Option A", summary: "What it is, in one sentence.", pros: ["Main advantage"], cons: ["Main cost"], recommended: true },
      { id: "opt-b", title: "Option B", summary: "What it is, in one sentence.", pros: ["Main advantage"], cons: ["Main cost"] },
    ],
  },
  tradeoff: {
    type: "tradeoff",
    items: [{ id: "opt-a", label: "Option A" }, { id: "opt-b", label: "Option B" }],
    axes: [{ id: "cost", label: "Low cost" }, { id: "speed", label: "Fast to ship" }, { id: "safety", label: "Low risk" }],
    scores: [
      { item: "opt-a", axis: "cost", value: 4, reason: "Reuses what exists" },
      { item: "opt-a", axis: "speed", value: 5, reason: "A few days" },
      { item: "opt-a", axis: "safety", value: 2, reason: "Touches the hot path" },
      { item: "opt-b", axis: "cost", value: 2, reason: "New service to run" },
      { item: "opt-b", axis: "speed", value: 2, reason: "Two sprints" },
      { item: "opt-b", axis: "safety", value: 5, reason: "Isolated from the hot path" },
    ],
  },
  graph: {
    type: "graph",
    nodes: [{ id: "g-web", label: "Web app" }, { id: "g-api", label: "API" }, { id: "g-db", label: "Database", change: "changed" }],
    edges: [{ from: "g-web", to: "g-api", label: "HTTP" }, { from: "g-api", to: "g-db" }],
  },
  timeline: {
    type: "timeline",
    unit: "days",
    tracks: [
      { id: "t-build", label: "Build", phases: [{ label: "Implement", duration: 3 }, { label: "Review", duration: 1 }] },
      { id: "t-rollout", label: "Rollout", phases: [{ label: "Canary", duration: 1, start: 4 }, { label: "Everyone", duration: 2 }] },
    ],
    events: [{ at: 4, label: "merge" }],
  },
  tree: {
    type: "tree",
    nodes: [
      { id: "tr-root", label: "Root" },
      { id: "tr-a", label: "First branch", parent: "tr-root", meta: "likely" },
      { id: "tr-a1", label: "Evidence for it", parent: "tr-a", status: "ok" },
      { id: "tr-b", label: "Second branch", parent: "tr-root", meta: "unlikely" },
    ],
  },
  matrix: {
    type: "matrix",
    columns: [{ id: "m-dev", label: "dev" }, { id: "m-prod", label: "production" }],
    rows: [
      { id: "m-r1", label: "Feature flag", cells: ["on", { v: "off", change: "changed" }] },
      { id: "m-r2", label: "Replicas", cells: ["1", "6"] },
    ],
  },
  steps: {
    type: "steps",
    id: "plan",
    items: [
      { id: "s-1", label: "First step", detail: "What it touches", meta: "~1 h" },
      { id: "s-2", label: "Second step", detail: "What it touches", meta: "~3 h" },
      { id: "s-3", label: "Third step", meta: "~30 min" },
    ],
  },
  sequence: {
    type: "sequence",
    actors: [{ id: "q-client", label: "Client" }, { id: "q-api", label: "API" }, { id: "q-db", label: "Database" }],
    messages: [
      { from: "q-client", to: "q-api", label: "POST /orders" },
      { from: "q-api", to: "q-db", label: "INSERT order" },
      { from: "q-db", to: "q-api", label: "id", reply: true },
      { from: "q-api", to: "q-client", label: "201 Created", reply: true },
    ],
  },
  quadrant: {
    type: "quadrant",
    id: "items",
    x: { label: "Effort", low: "low", high: "high" },
    y: { label: "Impact", low: "low", high: "high" },
    quadrants: ["Quick wins", "Big bets", "Fill-ins", "Avoid"],
    items: [{ id: "qd-1", label: "Item one", x: 2, y: 8 }, { id: "qd-2", label: "Item two", x: 7, y: 7 }, { id: "qd-3", label: "Item three", x: 6, y: 2 }],
  },
  board: {
    type: "board",
    columns: [
      { id: "b-todo", label: "To do", items: [{ id: "b-1", label: "Card one", tag: "story · 3 pts" }] },
      { id: "b-doing", label: "In progress", limit: 2, items: [{ id: "b-2", label: "Card two", tag: "bug", status: "warn" }] },
      { id: "b-done", label: "Done", items: [{ id: "b-3", label: "Card three", status: "ok" }] },
    ],
  },
  chart: {
    type: "chart",
    kind: "bar",
    unit: "ms",
    categories: ["p50", "p95", "p99"],
    series: [{ id: "c-before", label: "Before", values: [120, 480, 900] }, { id: "c-after", label: "After", values: [90, 210, 340] }],
  },
};

export const BLOCK_TYPES = Object.keys(TEMPLATES) as Block["type"][];

export const STARTERS: Record<PresentTool, unknown> = {
  present_view: { title: "New view", context: "One to three sentences of background.", blocks: [TEMPLATES.graph] },
  present_decision: { title: "New decision", question: "Which option do we go with?", blocks: [TEMPLATES.cards], response: { type: "choose_one", of: "options" } },
};
