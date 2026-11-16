import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, type Host } from "./App";
import { demo } from "./demo";
import { type Doc, normalize } from "./model";
import "./styles.css";

/** Running inside an MCP host: tool arguments arrive over the bridge. */
function Hosted() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [failed, setFailed] = useState(false);
  const { app, isConnected, error } = useApp({
    appInfo: { name: "diorama", version: "1.0.0-beta.1" },
    capabilities: {},
    onAppCreated: (a) => {
      a.ontoolinput = (params) => setDoc(normalize(params.arguments));
      // The server rejects calls whose references do not resolve; there is nothing to draw then.
      a.ontoolresult = (res) => setFailed(!!res.isError);
    },
  });
  useHostStyles(app, app?.getHostContext());

  const host = useMemo<Host | null>(() => {
    if (!app) return null;
    return {
      async record(rec) {
        const res = await app.callServerTool({ name: "record_decision", arguments: rec });
        if (res.isError) throw new Error("Could not record the answer");
      },
      async send(text) {
        try {
          const res = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
          return !res.isError;
        } catch {
          return false;
        }
      },
    };
  }, [app]);

  if (error) return <p className="wrap error">Could not connect to the host: {error.message}</p>;
  if (failed) return <p className="wrap muted">The view was rejected by the server; the agent has been told what to fix.</p>;
  if (!isConnected || !host || !doc) return <p className="wrap muted">Loading view…</p>;
  return <App doc={doc} host={host} />;
}

/** Opened directly in a browser: one sample, nothing is sent anywhere. The playground (`npm run preview`) is the place to try tool calls. */
function Standalone() {
  const [log, setLog] = useState<string[]>([]);
  const host: Host = {
    record: async (rec) => console.log("record_decision", rec),
    send: async (text) => (setLog((l) => [...l, text]), true),
  };
  const doc = normalize(demo);
  return (
    <>
      {doc && <App doc={doc} host={host} />}
      {log.length > 0 && <pre className="wrap gallery-log">{log.join("\n\n")}</pre>}
    </>
  );
}

const standalone = window.parent === window;
createRoot(document.getElementById("root")!).render(standalone ? <Standalone /> : <Hosted />);
