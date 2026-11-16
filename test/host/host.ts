// A minimal MCP Apps host for tests: plays the role the chat client plays.
// It asks the real server (through the /api endpoints of scripts/e2e.mjs) to run the tool,
// loads the view the server serves into an iframe and speaks the MCP Apps protocol to it.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

declare global {
  interface Window {
    __host: { ready: boolean; error?: string; messages: string[]; calls: { name: string; arguments: unknown }[]; toolResult?: unknown };
  }
}
window.__host = { ready: false, messages: [], calls: [] };

const q = new URLSearchParams(location.search);
const theme = q.get("theme") === "dark" ? "dark" : "light";
const refuse = q.has("refuse"); // simulate a host that does not accept messages from views
document.body.classList.toggle("dark", theme === "dark");
if (q.get("width")) document.querySelector("main")!.style.setProperty("--w", `${q.get("width")}px`);
const status = document.getElementById("status")!;
const chat = document.getElementById("chat")!;
const iframe = document.getElementById("view") as HTMLIFrameElement;

const api = async (path: string, body?: unknown) => {
  const res = await fetch(`/api/${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

async function main() {
  const scenario = await api(`scenario/${q.get("scenario") ?? 1}`);
  status.textContent = `${scenario.index}. ${scenario.slug} — ${scenario.tool}`;
  // The model's tool call: the real server validates it and returns the text the model would read.
  const result = await api("call", { name: scenario.tool, arguments: scenario.args });
  window.__host.toolResult = result;

  const bridge = new AppBridge(null, { name: "diorama-test-host", version: "0.0.0" }, { serverTools: {}, logging: {} }, { hostContext: { theme, displayMode: "inline" } });
  bridge.oncalltool = async (params) => {
    window.__host.calls.push({ name: params.name, arguments: params.arguments });
    return api("call", { name: params.name, arguments: params.arguments });
  };
  bridge.onmessage = async (params) => {
    if (refuse) return { isError: true };
    const text = params.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
    window.__host.messages.push(text);
    chat.appendChild(Object.assign(document.createElement("li"), { textContent: text }));
    return {};
  };
  bridge.onsizechange = ({ height }) => {
    if (height) iframe.style.height = `${height}px`;
  };
  bridge.oninitialized = () => {
    void bridge.sendToolInput({ arguments: scenario.args });
    void bridge.sendToolResult(result);
    window.__host.ready = true;
  };

  iframe.src = "/view";
  await new Promise((r) => iframe.addEventListener("load", r, { once: true }));
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
}

main().catch((err) => {
  window.__host.error = String(err);
  status.textContent = String(err);
});
