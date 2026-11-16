#!/usr/bin/env node
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { lint } from "../shared/lint.js";
import { lintFailure, summarize } from "../shared/present.js";
import { DecisionSchema, RecordSchema, ViewSchema, type Decision, type View } from "../shared/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const VIEW_FILE = join(here, "../ui/index.html");
const VIEW_URI = "ui://diorama/view.html";
const LOG_DIR = process.env.DIORAMA_DIR ?? join(process.cwd(), ".diorama");
const LOG_FILE = join(LOG_DIR, "decisions.jsonl");

const VOCABULARY = [
  "Blocks (pick by the shape of the data, 1-4 per view):",
  "- cards: alternatives with summary, pros, cons.",
  "- tradeoff: items scored 1-5 on criteria, one reason per score.",
  "- graph: nodes and edges. Variants: flow, state (state machine), entity (data model with fields), commits (git history on lanes).",
  "- timeline: phases per track on a shared scale, plus point events.",
  "- tree: hierarchy as a flat node list with `parent` (file tree, breakdown, hypotheses, query plan).",
  "- matrix: rows x columns (decision table, coverage, per-environment values, heat map).",
  "- steps: ordered or unordered list (plan, checklist, assumptions, evidence).",
  "- sequence: messages between actors. quadrant: items on two axes. board: cards in columns. chart: bar or line series.",
  "",
  "Properties, optional on any element: `change` (added/removed/changed/affected), `status` (ok/warn/failed/pending/running/blocked/skipped),",
  "`emphasis` (normal/highlighted/faded) and `note` (one short line shown next to it).",
  "",
  "States: every lens and every card is a named state, and the view is always in one of them (the recommended card or the first state; the user switches).",
  "`when` says what differs in a state: { \"id\": \"db\", \"status\": \"ok\", \"when\": { \"polling\": { \"status\": \"warn\", \"note\": \"10x reads\" } } }.",
  "The value outside `when` applies in every other state. An element that exists only in one option: \"emphasis\": \"faded\" with \"when\": { \"<option>\": { \"emphasis\": \"highlighted\" } }.",
  "`walkthrough` narrates steps; a step may switch `state` and spotlight some ids with `focus`.",
  "Ids are global: reuse an id across blocks only to say 'same thing'; hovering one highlights the others. Give a tradeoff item or a timeline track the id of the card it describes.",
  "Every block takes an optional `label` (short heading) and `id` (needed when `response.of` points at the block).",
  "",
  "Keep every text short. Send your reading of the data, not raw data. Scores, positions and estimates are rough: say so in `context` when it matters.",
].join("\n");

async function readLog(): Promise<unknown[]> {
  try {
    const raw = await readFile(LOG_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function present(args: View | Decision) {
  const problems = lint(args);
  if (problems.length) return { isError: true, content: [{ type: "text" as const, text: lintFailure(problems) }] };
  return { content: [{ type: "text" as const, text: summarize(args) }] };
}

function createServer(): McpServer {
  const server = new McpServer({ name: "diorama", version: "1.0.0-beta.1" });

  registerAppTool(
    server,
    "present_view",
    {
      title: "Present a view",
      description: [
        "Show the user an interactive visual to explain, explore or conclude something. Does not ask for an answer and does not block: keep working after calling it.",
        "",
        "USE IT when structure matters more than prose: how a system or flow works, a state machine, a data model, what a change touches, an incident timeline, a pipeline run, versions per environment, a query plan, progress of a long task.",
        "DO NOT use it for something two sentences can say, or to dump raw data a dedicated tool shows better.",
        "To ask the user something, use present_decision instead.",
        "",
        VOCABULARY,
      ].join("\n"),
      inputSchema: ViewSchema,
      _meta: { ui: { resourceUri: VIEW_URI } },
    },
    async (args) => present(args as View),
  );

  registerAppTool(
    server,
    "present_decision",
    {
      title: "Present a decision",
      description: [
        "Ask the user a question with an interactive visual and wait for a structured answer.",
        "",
        "USE IT when the answer depends on seeing structure: choosing between alternatives with real trade-offs, approving a plan step by step, cutting scope, prioritising, confirming your understanding before a costly change.",
        "DO NOT use it for simple or easily reversed questions (naming, yes/no, one preference): ask those in plain text.",
        "",
        "`response` says how the user answers:",
        "- choose_one: pick one item of the block named in `of` (usually a cards block). The user may also answer 'none of these'.",
        "- choose_many: tick any number of items of the block named in `of`.",
        "- approve: with `of`, approve or reject each item of that block; without `of`, one verdict on the whole view.",
        "Answerable blocks: cards, steps, matrix (rows), tree (nodes at `depth`), quadrant, board, graph (nodes). Give that block an `id`.",
        "When comparing options, give the cards ids and tag elements of other blocks with `in: [cardId]` so each option lights up its own part.",
        "",
        VOCABULARY,
        "",
        "After calling this tool, stop and wait for the user's answer.",
      ].join("\n"),
      inputSchema: DecisionSchema,
      _meta: { ui: { resourceUri: VIEW_URI } },
    },
    async (args) => present(args as Decision),
  );

  // Called by the view when the user answers; hidden from the model.
  registerAppTool(
    server,
    "record_decision",
    {
      title: "Record a decision",
      description: "Append the user's answer to the decision log. Called by the view.",
      inputSchema: RecordSchema,
      _meta: { ui: { resourceUri: VIEW_URI, visibility: ["app"] } },
    },
    async (args) => {
      const entry = { at: new Date().toISOString(), ...(args as z.infer<typeof RecordSchema>) };
      await mkdir(LOG_DIR, { recursive: true });
      await appendFile(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
      return { content: [{ type: "text", text: `Recorded in ${LOG_FILE}` }] };
    },
  );

  server.registerTool(
    "list_decisions",
    {
      title: "List recorded decisions",
      description:
        "Return the answers the user gave through present_decision in this workspace (newest last). Use it to recall earlier choices or to write decision records (ADRs).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const all = await readLog();
      const text = all.length ? JSON.stringify(all.slice(-limit), null, 2) : "No decisions recorded yet.";
      return { content: [{ type: "text", text }] };
    },
  );

  registerAppResource(
    server,
    "diorama view",
    VIEW_URI,
    { description: "Interactive view for present_view and present_decision", mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: await readFile(VIEW_FILE, "utf8") }],
    }),
  );

  return server;
}

serveStdio(createServer);
