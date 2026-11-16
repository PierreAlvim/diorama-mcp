# Diorama

A closed visual vocabulary for coding agents to **show** and **ask** inside the chat, as an [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) server. The agent sends structured data; the view draws it and handles the interaction. The agent never writes layout, style or behaviour.

**[Try it in the playground](https://pierrealvim.github.io/diorama-mcp/)**: write a tool call, see the view and what comes back. No install, nothing leaves the browser.

> Status: `1.0.0-beta.1`. The vocabulary may still change before 1.0.

Two things it is for:

- **Showing**: explaining a system, walking through an incident, reporting progress. Nothing is asked and the agent carries on.
- **Asking**: choosing between options, approving a plan step by step, picking what makes the cut. The answer goes back to the chat as a message and is appended to a local log.

## Install

Not on npm yet. The beta runs straight from the release tarball. In VS Code, add to `.vscode/mcp.json` (and turn on the `chat.mcp.apps.enabled` setting):

```json
{
  "servers": {
    "diorama": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "https://github.com/PierreAlvim/diorama-mcp/releases/download/v1.0.0-beta.1/diorama-mcp-1.0.0-beta.1.tgz"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Any MCP client that renders MCP Apps can use the same command. Clients that do not render them still get the text summary of each view.

## Setup from source

```bash
git clone https://github.com/PierreAlvim/diorama-mcp.git && cd diorama-mcp
npm install
npm run build   # view → dist/ui/index.html, server → dist/server/index.js
npm test        # schema check of all scenarios, stdio smoke test, browser end-to-end
```

`npm test` needs a system Chromium or Chrome (set `CHROME_PATH` to point at a specific binary).

### VS Code / Code OSS

Open this folder. `.vscode/mcp.json` registers the server and `.vscode/settings.json` turns on `chat.mcp.apps.enabled`.

1. Run **MCP: List Servers**, pick `diorama`, **Start**.
2. Open Chat in **Agent** mode and check that `present_view` and `present_decision` are enabled in the tools picker.
3. Try the prompts under [Checking it in a real host](#checking-it-in-a-real-host).

To use it in another project, add the same server to that project's `.vscode/mcp.json` with the absolute path to `dist/server/index.js`. Keep `"cwd": "${workspaceFolder}"` so each project gets its own log.

After changing code: `npm run build`, then restart the server from **MCP: List Servers**.

## Tools

| Tool | Called by | Waits for the user | What it does |
|---|---|---|---|
| `present_view` | the agent | no | Shows a view. For explaining, exploring and concluding. |
| `present_decision` | the agent | yes | Shows a view with a question and a typed response. |
| `record_decision` | the view | — | Appends the answer to `.diorama/decisions.jsonl`. Hidden from the agent. |
| `list_decisions` | the agent | — | Returns the recorded answers, for recall or for writing ADRs. |

Set `DIORAMA_DIR` to move the log somewhere other than `<cwd>/.diorama`.

## Vocabulary

A view is `title`, optional `context`, and 1–4 **blocks**. Blocks are named after the shape of the data, not after a diagram type.

| Block | Data | Typical use |
|---|---|---|
| `cards` | items with summary, pros, cons | options of a decision |
| `tradeoff` | items × axes, score 1–5 with a reason | comparing by criteria |
| `graph` | nodes and edges; variants `flow`, `state`, `entity`, `commits` | architecture, pipeline, state machine, data model, branches |
| `timeline` | tracks with phases and point events | rollout plan, incident reconstruction |
| `tree` | flat node list with `parent` | hypotheses, epic breakdown, file tree, query plan |
| `matrix` | rows × columns, cells with text, heat or markers | decision table, coverage, config per environment, heat map |
| `steps` | ordered items | implementation plan, checklist, cut line, agent progress |
| `sequence` | actors and messages | API contract, service interaction |
| `quadrant` | items on two axes | backlog prioritisation |
| `board` | cards in columns | sprint board |
| `chart` | bar or line series | before/after measurements |

**Markers** are accepted on any element: `in` (lens ids it belongs to), `refs` (ids of related elements), `change` (`added`, `removed`, `changed`, `affected`), `status` (`ok`, `fail`, `running`, `warn`, `pending`), `note`. A diff, a blast radius or a pipeline status is a graph, tree or matrix with markers.

**Ids are global in a view.** The same id in two blocks means the same thing, which is what links the highlight across blocks.

**Interaction** is declared, never coded:

- **Linked highlight**: hovering an element lights up everything sharing its id or connected by `refs`.
- **Lenses**: `lenses[{id, label}]` plus `in` on elements. The user switches perspective; the rest dims. Each card is also a lens when a lens has its id.
- **Walkthrough**: `walkthrough[{text, focus[]}]`. The user steps through; the view follows.
- **Ask about this**: in a `present_view`, clicking an element sends a question about it to the chat.

**Responses** (`present_decision` only): `response: { type, of?, depth? }`.

| Type | `of` | The user |
|---|---|---|
| `choose_one` | a block id | picks one item, or "None of these" |
| `choose_one` | 2–4 block ids | picks one item per block (e.g. one resolution per conflict) |
| `choose_many` | a block id | ticks any number of items |
| `approve` | a block id | approves or rejects each item |
| `approve` | omitted | approves or rejects the whole view |

`depth` selects the answerable level when the block is a tree.

The server checks every call for dangling references (unknown ids in edges, scores, `focus`, `response.of`, wrong cell counts, …) and returns the list to the model instead of showing a broken view.

The schema is in [shared/schema.ts](shared/schema.ts); the reference checks in [shared/lint.ts](shared/lint.ts).

## Scenarios

[docs/cenarios.md](docs/cenarios.md) (in Portuguese, payloads in English) describes 36 scenarios with sample data, the tool call and a wireframe each. The data lives in `docs/scenarios/data-*.mjs` and is used three ways:

- `npm run docs` regenerates the document and the wireframes.
- `npm run test:scenarios` validates every call against the schema, strictly.
- `npm run test:e2e` runs every scenario through the real server and view (below).

The same 36 calls are preloaded in the playground.

## Playground

```bash
npm run preview            # dev server
npm run build:playground   # static site in dist/playground, hostable anywhere (GitHub Pages, any file server)
```

A page to write a tool call and see what it does, without an MCP host or a model. Nothing leaves the browser.

- **Left: the tool call.** Edit it as JSON or through a form; both edit the same value. The form is derived from the tool's JSON Schema, so a new block or field in `shared/schema.ts` appears without any form code. Paste works for `{tool, arguments}`, for `{name, arguments}` as MCP logs print it, and for bare arguments. `+ block` appends a minimal example of any block ([playground/src/templates.ts](playground/src/templates.ts)).
- **Update preview** (Ctrl+Enter) runs the call. There is no live rendering.
- **Right: the real view**, in a sandboxed iframe sized to its content as chat hosts do. Width and theme can be switched to see how it behaves in a narrow or dark chat.
- **Below: what comes back.** The tool result exactly as the model reads it (the summary, or the list of what to fix when the call is rejected), the chat message sent when the user answers or asks, and the record that would be appended to the log. Validation is the same code the server runs ([shared/present.ts](shared/present.ts)).
- **Size**: bytes and estimated tokens of the arguments, i.e. what the call costs the model to write.
- **Copy link** packs the call into the URL hash. `#s=N` opens scenario N.

## Tests

| Command | What it covers |
|---|---|
| `npm run typecheck` | server, view and scripts |
| `npm run test:scenarios` | all scenario payloads against the schema and the reference checks |
| `npm run test:smoke` | the built server over stdio: tool list, lint rejections, the UI resource, the decision log |
| `npm run test:e2e` | a minimal MCP Apps host ([test/host/](test/host/)) in headless Chromium: for each scenario it renders the view in a sandboxed iframe, exercises lenses, walkthrough and hover, answers the decision and checks the chat message, the `record_decision` call and the log line |

| `npm run test:playground` | the static playground in headless Chromium: all scenarios load, form and JSON stay in sync, errors are reported, answers reach the output panel, shared links round-trip |

`npx tsx scripts/e2e.ts --shots` also writes light and dark screenshots of every scenario to `dist/screens/`.

The end-to-end host implements the same protocol a real client does, but it is not one. What it cannot tell: whether a given model picks the right tool and block for a prompt, and how a given client sizes and themes the iframe.

## Checking it in a real host

One prompt per area. Start with "Use diorama" until you see how readily the model picks the tools up by itself.

1. **Decision (`cards`, `tradeoff`, `graph`)** — "We need to keep a CRM in sync with our billing database within a few minutes; there is no message broker in production. Show me the alternatives and let me choose."
2. **Plan approval (`steps`, `approve`)** — "Plan adding rate limiting to the public API and let me approve or reject each step."
3. **Explanation (`graph` + walkthrough)** — "Walk me through how a request travels through this repository."
4. **Diagnosis (`tree`, `choose_one`)** — "We get intermittent 502s on /api/reports at night. Show your hypotheses with the evidence for each and ask which to test first."
5. **`sequence`** — "Show the OAuth authorization-code flow between browser, app, identity provider and API."
6. **`quadrant`** — "Here are nine tech-debt items: … Place them by impact and effort and let me pick this cycle's."
7. **`board`** — "Show the sprint as a board and point out what is stuck." (with a Jira/GitHub MCP, or paste the tickets)
8. **`chart`** — "I ran the benchmark before and after the change: … Show the comparison."
9. **`matrix` with markers** — "Compare the configuration of dev, staging and production and mark what differs."
10. **Log** — after a few answers: "Use list_decisions and write an ADR for each decision into docs/adr/."

Things to look at: the view fits the chat width, dark theme, the answer arrives as a chat message, and after a `present_view` the agent keeps going without waiting.

## Layout

```
shared/schema.ts     zod schemas, shared by server and view
shared/lint.ts       reference checks, shared by server, view tests and docs
shared/present.ts    what a present_* call returns to the model; shared by server and playground
server/index.ts      MCP server (stdio)
ui/src/model.ts      pure logic: highlight, picks, answer messages
ui/src/App.tsx       shell: lenses, walkthrough, footer
ui/src/blocks/       one renderer per block
playground/          editor page + the view in an iframe; schema-derived form
test/host/           minimal MCP Apps host used by the end-to-end test
scripts/             smoke, e2e (host and playground), scenario check, docs generator
docs/                V1 definition and scenario catalogue (Portuguese)
```

## License

[MIT](LICENSE)
