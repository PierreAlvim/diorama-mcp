// End-to-end test: real server over stdio + the built view inside a test host, driven with Chromium.
// For every scenario in docs/scenarios it runs the tool call, renders the view, performs the sample
// interaction and checks what comes back to the "chat" and to the decision log.
// Run with: npm run test:e2e [-- <scenario numbers>] [--shots]
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { chromium, type Frame, type Page } from "playwright-core";
import partA from "../docs/scenarios/data-a.mjs";
import partB from "../docs/scenarios/data-b.mjs";
import type { Decision } from "../shared/schema.js";
import { type Doc, buildAnswer, isDecision, targets } from "../ui/src/model.js";
import { type Scenario, samplePicks } from "./sample.js";

const scenarios = [...partA, ...partB] as unknown as Scenario[];
const argv = process.argv.slice(2);
const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const shots = argv.includes("--shots") ? join(process.cwd(), "dist/screens") : null;
const CHROME = process.env.CHROME_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) throw new Error("No Chromium found; set CHROME_PATH.");

const dir = await mkdtemp(join(tmpdir(), "diorama-e2e-"));
const client = new Client({ name: "e2e", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/server/index.js"], env: { ...process.env, DIORAMA_DIR: dir } as Record<string, string> }));
const tools = (await client.listTools()).tools;
const viewUri = (tools.find((t) => t.name === "present_view")!._meta as { ui: { resourceUri: string } }).ui.resourceUri;
const viewHtml = ((await client.readResource({ uri: viewUri })).contents[0] as { text: string }).text;

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const extra: Scenario[] = [];
const http = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://x");
    const json = (body: unknown) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(body)));
    if (url.pathname === "/view") return void (res.setHeader("content-type", "text/html"), res.end(viewHtml));
    if (url.pathname.startsWith("/api/scenario/")) {
      const n = Number(url.pathname.split("/").pop());
      const sc = n > 0 ? scenarios[n - 1] : extra[-n - 1];
      return json({ index: n, slug: sc.slug, tool: sc.tool, args: sc.args });
    }
    if (url.pathname === "/api/call") {
      let body = "";
      for await (const chunk of req) body += chunk;
      return json(await client.callTool(JSON.parse(body)).catch((e) => ({ isError: true, content: [{ type: "text", text: String(e) }] })));
    }
    if (url.pathname === "/favicon.ico") return void ((res.statusCode = 204), res.end());
    const file = join("dist/host", url.pathname === "/" ? "index.html" : url.pathname);
    res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
});
await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
const browser = await chromium.launch({ executablePath: CHROME });
if (shots) await mkdir(shots, { recursive: true });

interface Session {
  page: Page;
  view: Frame;
  errors: string[];
  host(): Promise<Window["__host"]>;
}
async function open(n: number, opts: { theme?: string; refuse?: boolean; width?: number } = {}): Promise<Session> {
  const page = await browser.newPage({ viewport: { width: (opts.width ?? 760) + 40, height: 900 }, colorScheme: opts.theme === "dark" ? "dark" : "light" });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${base}/?scenario=${n}&theme=${opts.theme ?? "light"}${opts.refuse ? "&refuse" : ""}${opts.width ? `&width=${opts.width}` : ""}`);
  await page.waitForFunction(() => window.__host.ready || window.__host.error, null, { timeout: 10_000 });
  const host = () => page.evaluate(() => window.__host);
  assert.equal((await host()).error, undefined);
  const view = page.frames().find((f) => f !== page.mainFrame())!;
  return { page, view, errors, host };
}
const shot = async (s: Session, name: string) => {
  if (!shots) return;
  await s.page.waitForTimeout(150); // let the host apply the reported height
  await s.page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
};
const item = (view: Frame, block: string, id: string) => view.locator(`[data-block="${block}"] [data-id="${id}"]`).first();

async function runScenario(n: number, sc: Scenario) {
  const doc = sc.args as unknown as Doc;
  const sample = sc.sample ?? {};
  const s = await open(n);
  const { view } = s;
  const result = (await s.host()).toolResult as { isError?: boolean; content: { text: string }[] };
  assert.ok(!result.isError, `server rejected the call: ${result.content?.[0]?.text}`);
  await view.locator(".wrap h1").waitFor();
  assert.equal(await view.locator(".wrap h1").textContent(), doc.title);
  assert.equal(await view.locator("section.block").count(), doc.blocks.length, "every block renders");
  assert.equal(await view.getByText("Unknown block type").count(), 0);

  // Interactivity: lens, walkthrough, linked highlight.
  if (sample.lens && doc.lenses) {
    await view.getByRole("button", { name: doc.lenses.find((l) => l.id === sample.lens)!.label, exact: true }).click();
    assert.ok((await view.locator(".el.on").count()) > 0, "the lens highlights its elements");
    assert.ok((await view.locator(".el.off").count()) > 0, "the lens dims other lenses' elements");
  }
  if (doc.walkthrough) {
    if (sample.lens) await view.getByRole("button", { name: "Next step" }).click(); // resumes at step 1
    for (let i = 0; i < doc.walkthrough.length; i++) {
      assert.ok(await view.getByText(`Step ${i + 1} of ${doc.walkthrough.length}`).isVisible());
      assert.ok((await view.locator(".el.on").count()) > 0, `walkthrough step ${i + 1} highlights something`);
      if (i < doc.walkthrough.length - 1) await view.getByRole("button", { name: "Next step" }).click();
    }
    for (let i = doc.walkthrough.length - 1; i > (sample.step ?? 0); i--) await view.getByRole("button", { name: "Previous step" }).click();
  }
  if (sample.hover) {
    await view.locator(`[data-id="${sample.hover}"]`).first().hover();
    assert.ok((await view.locator(".el.on, .cell.on").count()) >= 2, "hover highlights the related elements");
  }
  if (!isDecision(doc)) await shot(s, `${String(n).padStart(2, "0")}-${sc.slug}`);

  if (isDecision(doc)) {
    const picks = samplePicks(doc, sample);
    const of = targets(doc.response);
    for (const [key, v] of Object.entries(picks)) {
      const [block, id] = [key.slice(0, key.indexOf("/")), key.slice(key.indexOf("/") + 1)];
      const el = item(view, block, id);
      if (doc.response.type === "approve") await el.getByRole("button", { name: v === "ok" ? "Approve" : "Reject" }).click();
      else await el.click();
    }
    if (sample.note) await view.locator("textarea").fill(sample.note);
    if (sample.hover) await view.locator(`[data-id="${sample.hover}"]`).first().hover();
    await shot(s, `${String(n).padStart(2, "0")}-${sc.slug}`);
    const expected = buildAnswer(doc, picks, sample.note ?? "", doc.response.type === "approve" && of.length === 0 ? "approved" : undefined);
    await view.locator(".footer button.primary").click();
    await view.locator(".done").waitFor();
    const host = await s.host();
    assert.deepEqual(host.messages, [expected.message], "the chat receives the answer");
    assert.equal(host.calls.length, 1);
    assert.equal(host.calls[0].name, "record_decision");
    const logged = (await readFile(join(dir, "decisions.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l)).at(-1);
    assert.equal(logged.message, expected.message, "the answer is in the decision log");
    assert.deepEqual(logged.picks, expected.record.picks);
    assert.ok(await view.getByText("Sent to the chat and recorded.").isVisible());
  } else {
    // Ask about an element: any element that offers it.
    const target = view.locator(".el.clickable").first();
    assert.ok((await target.count()) > 0, "a view has at least one element to ask about");
    await target.click();
    await view.locator(".ask input").fill("why?");
    await view.locator(".ask button.primary").click();
    await view.getByText("Sent to the chat.").waitFor();
    const { messages, calls } = await s.host();
    assert.equal(messages.length, 1);
    assert.match(messages[0], new RegExp(`^About ".+"( \\(id: .+\\))? in "${doc.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}": why\\?$`));
    assert.equal(calls.length, 0, "a view records nothing");
  }
  assert.deepEqual(s.errors, [], "no console errors");

  if (shots) {
    const dark = await open(n, { theme: "dark" });
    await dark.view.locator(".wrap h1").waitFor();
    await shot(dark, `${String(n).padStart(2, "0")}-${sc.slug}-dark`);
    await dark.page.close();
  }
  await s.page.close();
}

// ---- behaviours no scenario covers --------------------------------------
const first = scenarios[0];
const cases: [string, () => Promise<void>][] = [
  ["none of these", async () => {
    const s = await open(1);
    await s.view.locator("textarea").fill("too heavy");
    await s.view.getByRole("button", { name: "None of these" }).click();
    await s.view.locator(".done").waitFor();
    assert.deepEqual((await s.host()).messages, [`Decision on "${first.args.title}": none of the options work for me.\nReason: too heavy`]);
    await s.page.close();
  }],
  ["host refuses the message", async () => {
    const s = await open(1, { refuse: true });
    await item(s.view, "options", "ws").click();
    await s.view.locator(".footer button.primary").click();
    await s.view.locator(".done pre").waitFor();
    assert.match((await s.view.locator(".done pre").textContent())!, /go with "WebSocket gateway"/);
    assert.equal((await s.host()).calls.length, 1, "still recorded");
    await s.page.close();
  }],
  ["confirm stays disabled until something is chosen", async () => {
    const s = await open(1);
    assert.ok(await s.view.locator(".footer button.primary").isDisabled());
    await item(s.view, "options", "poll").click();
    assert.ok(await s.view.locator(".footer button.primary").isEnabled());
    await item(s.view, "options", "poll").click(); // toggles off
    assert.ok(await s.view.locator(".footer button.primary").isDisabled());
    await s.page.close();
  }],
  ["hovering a card switches the lens", async () => {
    const s = await open(1);
    const node = s.view.locator('[data-id="gw"]');
    assert.match((await node.getAttribute("class"))!, /\boff\b/, "WS gateway is dimmed while SSE (recommended) is the lens");
    await item(s.view, "options", "ws").hover();
    assert.match((await node.getAttribute("class"))!, /\bon\b/);
    await s.page.close();
  }],
  ["approve all", async () => {
    const n = scenarios.findIndex((x) => x.slug === "implementation-plan") + 1;
    const s = await open(n);
    await s.view.getByRole("button", { name: "Approve all" }).click();
    await s.view.locator(".footer button.primary").click();
    await s.view.locator(".done").waitFor();
    assert.match((await s.host()).messages[0], /: approved s1, s2, s3, s4, s5, s6\.$/);
    await s.page.close();
  }],
  ["reject the whole view", async () => {
    const n = scenarios.findIndex((x) => x.slug === "blast-radius") + 1;
    const s = await open(n);
    await s.view.getByRole("button", { name: "Reject" }).click();
    await s.view.locator(".done").waitFor();
    assert.match((await s.host()).messages[0], /^Rejected "/);
    await s.page.close();
  }],
  ["server rejects dangling references and the view says so", async () => {
    extra.push({ slug: "bad", group: "", title: "", tool: "present_decision", args: { title: "Bad", question: "?", blocks: [{ type: "graph", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "zzz" }] }], response: { type: "choose_one", of: "nope" } } });
    const s = await open(-extra.length);
    const result = (await s.host()).toolResult as { isError?: boolean; content: { text: string }[] };
    assert.ok(result.isError);
    assert.match(result.content[0].text, /unknown node "zzz"/);
    assert.match(result.content[0].text, /no block has id "nope"/);
    await s.view.getByText("The view was rejected by the server").waitFor();
    await s.page.close();
  }],
  ["narrow host: wide graphs fall back to a vertical layout", async () => {
    const n = scenarios.findIndex((x) => x.slug === "codebase-tour") + 1;
    const s = await open(n, { width: 420 });
    await s.view.locator(".graph svg").waitFor();
    const box = (await s.view.locator(".graph svg").boundingBox())!;
    assert.ok(box.height > box.width * 0.8, `expected a tall layout, got ${Math.round(box.width)}x${Math.round(box.height)}`);
    await shot(s, "narrow-codebase-tour");
    await s.page.close();
  }],
];

let failed = 0;
const run = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n    ${String(err instanceof Error ? err.message : err).split("\n").slice(0, 6).join("\n    ")}`);
    for (const p of browser.contexts().flatMap((c) => c.pages())) {
      if (process.env.E2E_DEBUG) await p.screenshot({ path: join(process.env.E2E_DEBUG, `fail-${name.split(" ")[0]}.png`), fullPage: true }).catch(() => {});
      await p.close().catch(() => {});
    }
  }
};
try {
  for (const [i, sc] of scenarios.entries()) if (!only.length || only.includes(i + 1)) await run(`${i + 1} ${sc.slug} (${sc.tool})`, () => runScenario(i + 1, sc));
  if (!only.length) for (const [name, fn] of cases) await run(name, fn);
} finally {
  await browser.close();
  http.close();
  await client.close();
  await rm(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : `ok${shots ? `, screenshots in ${shots}` : ""}`);
process.exit(failed ? 1 : 0);
