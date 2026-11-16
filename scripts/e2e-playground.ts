// End-to-end test of the playground: the static build in Chromium, no MCP server involved.
// Run with: npm run test:playground [-- --shots]
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium, type Page } from "playwright-core";
import partA from "../docs/scenarios/data-a.mjs";
import partB from "../docs/scenarios/data-b.mjs";
import { BLOCK_TYPES, STARTERS, TEMPLATES } from "../playground/src/templates.js";
import { check, type PresentTool } from "../shared/present.js";

const scenarios = [...partA, ...partB];
const shots = process.argv.includes("--shots") ? join(process.cwd(), "dist/screens") : null;
const CHROME = process.env.CHROME_PATH ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) throw new Error("No Chromium found; set CHROME_PATH.");

const ROOT = join(process.cwd(), "dist/playground");
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const http = createServer(async (req, res) => {
  try {
    const path = normalize(new URL(req.url!, "http://x").pathname);
    if (path === "/favicon.ico") return void ((res.statusCode = 204), res.end());
    const file = join(ROOT, path === "/" ? "index.html" : path);
    res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(http.address() as { port: number }).port}/`;
const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
if (shots) await mkdir(shots, { recursive: true });

const errors: string[] = [];
async function open(hash = ""): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(base + hash);
  await view(page).locator(".wrap h1").waitFor();
  return page;
}
const view = (page: Page) => page.frameLocator('iframe[title="View"]');
const update = (page: Page) => page.getByRole("button", { name: "Update preview" });
const result = (page: Page) => page.locator('[data-out="result"] pre');
const editor = (page: Page) => page.getByLabel("Tool call JSON");
const tab = (page: Page, name: "Form" | "JSON") => page.getByRole("tab", { name }).click();
const setJson = async (page: Page, value: unknown) => (await tab(page, "JSON"), await editor(page).fill(typeof value === "string" ? value : JSON.stringify(value)));

const cases: [string, () => Promise<void>][] = [
  ["block templates and starters are valid tool calls", async () => {
    for (const t of BLOCK_TYPES) {
      const out = check("present_view", { title: t, blocks: [TEMPLATES[t]] });
      assert.ok(out.ok, `${t}: ${out.text}`);
    }
    for (const tool of Object.keys(STARTERS) as PresentTool[]) {
      const out = check(tool, STARTERS[tool]);
      assert.ok(out.ok, `${tool}: ${out.text}`);
    }
  }],

  ["every scenario loads as a tool call and renders", async () => {
    const page = await open();
    for (let i = 0; i < scenarios.length; i++) {
      await page.getByLabel("Load a tool call").selectOption(String(i));
      await view(page).locator(".wrap h1", { hasText: (scenarios[i].args as { title: string }).title }).waitFor();
      const expected = check(scenarios[i].tool as PresentTool, scenarios[i].args);
      assert.equal(await result(page).textContent(), expected.text, `scenario ${i + 1}: tool result`);
      assert.equal(await view(page).locator("section.block").count(), (scenarios[i].args as { blocks: unknown[] }).blocks.length);
    }
    await page.close();
  }],

  ["#s=N opens a scenario", async () => {
    const page = await open("#s=17");
    assert.equal(await view(page).locator(".wrap h1").textContent(), (scenarios[16].args as { title: string }).title);
    await page.close();
  }],

  ["form edits the same value as the JSON, and the preview waits for the button", async () => {
    const page = await open();
    const before = await view(page).locator(".wrap h1").textContent();
    await page.locator('.form input[data-path="title"]').fill("Edited in the form");
    assert.equal(await view(page).locator(".wrap h1").textContent(), before, "no live rendering");
    await page.getByText("preview is behind the editor").waitFor();
    await tab(page, "JSON");
    assert.equal(JSON.parse(await editor(page).inputValue()).arguments.title, "Edited in the form");
    await update(page).click();
    await view(page).locator(".wrap h1", { hasText: "Edited in the form" }).waitFor();
    if (shots) await page.screenshot({ path: join(shots, "playground-json.png") });
    await page.close();
  }],

  ["form adds, fills and removes array items and optional fields", async () => {
    const page = await open();
    await page.getByLabel("Load a tool call").selectOption("view");
    await page.locator('.form .chip', { hasText: "+ lenses" }).click();
    const lenses = page.locator('.form .arr[data-path="lenses"]');
    await lenses.getByRole("button", { name: "+ add" }).click();
    await lenses.locator("summary").first().click();
    await page.locator('.form input[data-path="lenses[0].id"]').fill("after");
    await page.locator('.form input[data-path="lenses[0].label"]').fill("After");
    await update(page).click();
    await view(page).getByRole("button", { name: "After" }).waitFor();
    await lenses.getByRole("button", { name: "Remove item" }).click();
    await update(page).click();
    // The frame re-renders after the message arrives, so wait for the chip to go rather than count at once.
    await view(page).getByRole("button", { name: "After" }).waitFor({ state: "detached" });
    await page.close();
  }],

  ["the form edits `when` with the element's own dropdowns, offering the view's states", async () => {
    const page = await open();
    await page.getByLabel("Load a tool call").selectOption("decision");
    await page.locator('.form .arr[data-path="blocks"] > details > summary').nth(1).click();
    await page.locator('.form .arr[data-path="blocks[1].nodes"] > details > summary').first().click();
    const node = page.locator('.form .obj[data-path="blocks[1].nodes[0]"]');
    await node.locator(".chip", { hasText: "+ when" }).click();
    await node.getByRole("button", { name: "+ state" }).click();
    assert.equal(await node.getByLabel("State id").inputValue(), "opt-a", "the first state of the view is proposed");
    await node.locator('.obj[data-path="blocks[1].nodes[0].when.opt-a"] .chip', { hasText: "+ status" }).click();
    await page.locator('.form select[data-path="blocks[1].nodes[0].when.opt-a.status"]').selectOption("blocked");
    await update(page).click();
    await view(page).locator('.graph [data-id="d-app"][data-status="blocked"]').waitFor();
    await view(page).locator('[data-id="opt-b"]').first().hover();
    await view(page).locator('.graph [data-id="d-app"]:not([data-status])').waitFor();
    await page.close();
  }],

  ["+ block appends a template of any type", async () => {
    const page = await open();
    await page.getByLabel("Load a tool call").selectOption("view");
    for (const t of ["chart", "board", "sequence"]) await page.getByLabel("Add block").selectOption(t);
    await update(page).click();
    await view(page).locator("section.b-sequence").waitFor();
    assert.equal(await view(page).locator("section.block").count(), 4);
    // The fifth is over the limit of four blocks: the model would be told, and nothing is shown.
    await page.getByLabel("Add block").selectOption("steps");
    await update(page).click();
    await page.locator(".notshown").waitFor();
    assert.match((await result(page).textContent())!, /^Invalid arguments for present_view:\n- blocks: /);
    assert.ok(await page.locator('iframe[title="View"]').isHidden());
    await page.close();
  }],

  ["changing a block's type in the form swaps in that block's template", async () => {
    const page = await open();
    await page.getByLabel("Load a tool call").selectOption("view");
    await page.locator('.form .arr[data-path="blocks"] summary').first().click();
    await page.locator('.form select[data-path="blocks[0].type"]').selectOption("quadrant");
    await update(page).click();
    await view(page).locator("section.b-quadrant").waitFor();
    await page.close();
  }],

  ["invalid JSON disables the update and says where", async () => {
    const page = await open();
    await setJson(page, '{ "tool": "present_view", "arguments": { "title": ');
    await page.locator(".problem").waitFor();
    assert.ok(await update(page).isDisabled());
    await tab(page, "Form");
    await page.getByText("The JSON does not parse").waitFor();
    await page.close();
  }],

  ["schema errors mark the field; dangling references come back as the server words them", async () => {
    const page = await open();
    await setJson(page, { tool: "present_view", arguments: { title: "x", blocks: [{ type: "steps", items: [{ id: "a", label: "A", status: "done" }] }] } });
    await update(page).click();
    assert.match((await result(page).textContent())!, /blocks\[0\]\.items\[0\]\.status: /);
    await tab(page, "Form");
    const block = page.locator('.form .arr[data-path="blocks"] > details.bad');
    await block.locator("> summary").click();
    await block.locator("details.bad > summary").click();
    assert.equal(await page.locator('.form [data-path="blocks[0].items[0].status"]').getAttribute("aria-invalid"), "true");

    await setJson(page, { tool: "present_view", arguments: { title: "x", blocks: [TEMPLATES.steps], walkthrough: [{ text: "t", focus: ["ghost"] }] } });
    await update(page).click();
    assert.match((await result(page).textContent())!, /^The view was not shown\. Fix these and call again:\n- .*unknown id "ghost"/);
    await page.close();
  }],

  ["pasted tool calls: MCP `name` envelope and bare arguments", async () => {
    const page = await open();
    await setJson(page, { name: "present_decision", arguments: STARTERS.present_decision });
    await update(page).click();
    await view(page).locator(".wrap h1", { hasText: "New decision" }).waitFor();
    await setJson(page, { title: "Bare", blocks: [TEMPLATES.tree] });
    await update(page).click();
    await view(page).locator(".wrap h1", { hasText: "Bare" }).waitFor();
    assert.equal(await page.getByLabel("Tool", { exact: true }).inputValue(), "present_view");
    await setJson(page, { tool: "draw_anything", arguments: {} });
    await page.locator(".problem", { hasText: 'Unknown tool "draw_anything"' }).waitFor();
    await page.close();
  }],

  ["answering shows the chat message and the record; updating clears them", async () => {
    const page = await open();
    await page.getByLabel("Load a tool call").selectOption("decision");
    await view(page).locator('[data-id="opt-b"]').first().click();
    await view(page).locator("textarea").fill("because");
    await view(page).locator("button.primary").click();
    await view(page).locator(".done").waitFor();
    const chat = page.locator('[data-out="chat"] pre');
    await chat.waitFor();
    assert.equal(await chat.textContent(), 'Decision on "New decision": go with "Option B" (option id: opt-b).\nNote: because');
    const record = JSON.parse((await page.locator('[data-out="record"] pre').textContent())!);
    assert.deepEqual(record.picks.filter((p: { verdict: string }) => p.verdict === "chosen").map((p: { id: string }) => p.id), ["opt-b"]);
    assert.equal(record.note, "because");
    if (shots) await page.screenshot({ path: join(shots, "playground-answered.png") });
    await update(page).click();
    await view(page).locator("button.primary").waitFor();
    assert.equal(await chat.count(), 0);
    await page.close();
  }],

  ["a view can be asked about", async () => {
    const page = await open("#s=17");
    await view(page).locator(".el.clickable").first().click();
    await view(page).locator(".ask input").fill("why?");
    await view(page).locator(".ask button.primary").click();
    await page.locator('[data-out="chat"] pre', { hasText: "why?" }).waitFor();
    assert.equal(await page.locator('[data-out="record"] pre').count(), 0, "a view records nothing");
    await page.close();
  }],

  ["width and theme change the frame, not the tool call", async () => {
    const page = await open();
    const frame = page.locator('iframe[title="View"]');
    await page.getByRole("button", { name: "Narrow 380" }).click();
    assert.equal((await frame.boundingBox())!.width, 380);
    await page.getByRole("button", { name: "dark", exact: true }).click();
    await view(page).locator('html[data-theme="dark"]').waitFor();
    if (shots) await page.screenshot({ path: join(shots, "playground-narrow-dark.png") });
    await page.getByRole("button", { name: "light", exact: true }).click();
    await view(page).locator('html[data-theme="light"]').waitFor();
    assert.equal(await page.getByText("preview is behind the editor").count(), 0);
    await page.close();
  }],

  ["the frame grows to its content, as in a chat host", async () => {
    const page = await open("#s=1");
    const frame = page.locator('iframe[title="View"]');
    const inner = await view(page).locator("html").evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
    await page.waitForFunction((h) => Math.abs(document.querySelector("iframe")!.getBoundingClientRect().height - h) <= 2, inner);
    assert.ok((await frame.boundingBox())!.height > 300);
    await page.close();
  }],

  ["a shared link reopens the same tool call", async () => {
    const page = await open("#s=5");
    await page.locator('.form input[data-path="title"]').fill("Shared ✓ título");
    await page.getByRole("button", { name: "Copy link" }).click();
    await page.getByRole("status").waitFor();
    const url = await page.evaluate(() => location.href);
    assert.match(url, /#p=[\w-]+$/);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
    await tab(page, "JSON");
    const text = await editor(page).inputValue();
    const other = await open(url.slice(base.length));
    await view(other).locator(".wrap h1", { hasText: "Shared ✓ título" }).waitFor();
    await tab(other, "JSON");
    assert.equal(await editor(other).inputValue(), text);
    await other.close();
    await page.close();
  }],

  ["screenshots", async () => {
    if (!shots) return;
    const page = await open("#s=3");
    await page.locator('.form .arr[data-path="blocks"] summary').first().click();
    await page.screenshot({ path: join(shots, "playground-form.png") });
    await page.close();
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  const before = errors.length;
  try {
    await run();
    assert.deepEqual(errors.slice(before), [], "no console errors");
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n  ${String((err as Error).message ?? err).split("\n").slice(0, 6).join("\n  ")}`);
    for (const p of context.pages()) await p.close();
  }
}
await browser.close();
http.close();
console.log(failed ? `${failed} failed` : "ok");
process.exit(failed ? 1 : 0);
