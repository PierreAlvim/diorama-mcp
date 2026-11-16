// Starts the built server over stdio and exercises every tool, without a browser. Run with: npm run test:smoke
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const dir = await mkdtemp(join(tmpdir(), "diorama-"));
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/server/index.js"], env: { ...process.env, DIORAMA_DIR: dir } }));
const call = (name, args) => client.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ type: "text", text: String(e) }] }));
const cards = { type: "cards", id: "options", items: [{ id: "a", title: "A", recommended: true }, { id: "b", title: "B" }] };

try {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["list_decisions", "present_decision", "present_view", "record_decision"]);
  const uris = ["present_view", "present_decision", "record_decision"].map((n) => tools.find((t) => t.name === n)._meta?.ui?.resourceUri);
  assert.ok(uris[0] && new Set(uris).size === 1, "the three app tools share one UI resource");
  assert.deepEqual(tools.find((t) => t.name === "record_decision")._meta.ui.visibility, ["app"], "record_decision is hidden from the model");
  const schemaSize = JSON.stringify(tools.map((t) => [t.description, t.inputSchema])).length;

  const decision = await call("present_decision", { title: "Smoke", question: "A or B?", blocks: [cards], response: { type: "choose_one", of: "options" } });
  assert.ok(!decision.isError, JSON.stringify(decision.content));
  assert.match(decision.content[0].text, /- a: A\n- b: B/);
  assert.match(decision.content[0].text, /Stop here and wait/);

  const view = await call("present_view", { title: "Smoke view", blocks: [{ type: "steps", items: [{ id: "s1", label: "One", status: "ok" }] }] });
  assert.ok(!view.isError, JSON.stringify(view.content));
  assert.match(view.content[0].text, /does not need an answer/);

  // Schema errors and dangling references are both reported back to the model.
  assert.ok((await call("present_view", { title: "x", blocks: [] })).isError, "an empty view is rejected");
  assert.ok((await call("present_view", { title: "x", blocks: [{ type: "canvas" }] })).isError, "unknown block types are rejected");
  const dangling = await call("present_decision", { title: "x", question: "y", blocks: [cards], response: { type: "choose_many", of: "missing" } });
  assert.ok(dangling.isError);
  assert.match(dangling.content[0].text, /no block has id "missing"/);
  const noOf = await call("present_decision", { title: "x", question: "y", blocks: [cards], response: { type: "choose_one" } });
  assert.match(noOf.content[0].text, /`of` is required/);
  const tree = await call("present_view", { title: "x", blocks: [{ type: "tree", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B", parent: "nope" }] }] });
  assert.match(tree.content[0].text, /unknown parent "nope"/);
  const walk = await call("present_view", { title: "x", blocks: [cards], walkthrough: [{ text: "t", focus: ["ghost"] }] });
  assert.match(walk.content[0].text, /unknown id "ghost"/);

  const res = await client.readResource({ uri: uris[0] });
  const html = res.contents[0];
  assert.equal(html.mimeType, "text/html;profile=mcp-app");
  assert.ok(html.text.includes('<div id="root">') && !/<script[^>]+src=/.test(html.text), "view must be one self-contained file");
  assert.ok(!html.text.includes("Real-time notifications"), "scenario fixtures must not ship in the view");

  const rec = await call("record_decision", { title: "Smoke", question: "A or B?", type: "choose_one", picks: [{ id: "a", label: "A", verdict: "chosen", block: "options" }], note: "because", message: "go with A" });
  assert.ok(!rec.isError, JSON.stringify(rec.content));
  const line = JSON.parse((await readFile(join(dir, "decisions.jsonl"), "utf8")).trim());
  assert.equal(line.picks[0].id, "a");
  assert.ok(line.at);
  assert.match((await call("list_decisions", {})).content[0].text, /"message": "go with A"/);

  console.log(`ok: ${names.length} tools (${(schemaSize / 1024).toFixed(1)} kB of descriptions and schemas), view ${(html.text.length / 1024).toFixed(0)} kB`);
} finally {
  await client.close();
  await rm(dir, { recursive: true, force: true });
}
