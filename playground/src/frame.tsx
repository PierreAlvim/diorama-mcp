import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, type Host } from "../../ui/src/App";
import "../../ui/src/styles.css";
import type { FromFrame, ToFrame } from "./protocol";

const post = (m: FromFrame) => window.parent.postMessage(m, location.origin);

const host: Host = {
  record: async (record) => post({ type: "diorama:record", record }),
  send: async (text) => (post({ type: "diorama:send", text }), true),
};

/** The real view component, fed by the playground page instead of an MCP host. */
function Frame() {
  const [msg, setMsg] = useState<ToFrame | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent<ToFrame>) => {
      if (e.source !== window.parent || e.data?.type !== "diorama:render") return;
      document.documentElement.dataset.theme = e.data.theme;
      setMsg(e.data);
    };
    window.addEventListener("message", onMessage);
    // The page sizes the iframe to its content, as chat hosts do.
    const ro = new ResizeObserver(() => post({ type: "diorama:size", height: Math.ceil(document.documentElement.getBoundingClientRect().height) }));
    ro.observe(document.documentElement);
    post({ type: "diorama:ready" });
    return () => (window.removeEventListener("message", onMessage), ro.disconnect());
  }, []);
  if (!msg?.doc) return null;
  // `run` remounts the view on every update so picks and steps start clean.
  return <App key={msg.run} doc={msg.doc} host={host} />;
}

document.body.style.background = "var(--bg)";
createRoot(document.getElementById("root")!).render(<Frame />);
