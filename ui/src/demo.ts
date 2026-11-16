import type { Decision } from "../../shared/schema";

/** Sample shown when the built view is opened outside a host. */
export const demo: Decision = {
  title: "Customer sync strategy",
  context: "The CRM is the source of truth for customers; the app needs them within minutes.",
  question: "How should we sync customers from the CRM?",
  blocks: [
    {
      type: "cards",
      id: "options",
      items: [
        { id: "cdc", title: "Change data capture", summary: "Stream row changes from the CRM database.", pros: ["Near real-time", "No load on the CRM API"], cons: ["Needs DB access"], effort: "high", risk: "medium" },
        { id: "batch", title: "Nightly batch", summary: "Full export every night.", pros: ["Simple to run"], cons: ["Up to 24 h stale"], effort: "low", risk: "low" },
        { id: "poll", title: "Polling API", summary: "Ask the CRM API for changes every 5 minutes.", pros: ["No infra"], cons: ["Rate limits"], effort: "medium", risk: "low", recommended: true },
      ],
    },
    {
      type: "graph",
      nodes: [
        { id: "crm", label: "CRM" },
        { id: "stream", label: "Debezium", emphasis: "faded", when: { cdc: { emphasis: "highlighted" } } },
        { id: "job", label: "Export job", emphasis: "faded", when: { batch: { emphasis: "highlighted" } } },
        { id: "poller", label: "Poller", emphasis: "faded", when: { poll: { emphasis: "highlighted" } } },
        { id: "app", label: "App database" },
      ],
      edges: [
        { from: "crm", to: "stream", emphasis: "faded", when: { cdc: { emphasis: "highlighted" } } },
        { from: "stream", to: "app", emphasis: "faded", when: { cdc: { emphasis: "highlighted" } } },
        { from: "crm", to: "job", emphasis: "faded", when: { batch: { emphasis: "highlighted" } } },
        { from: "job", to: "app", emphasis: "faded", when: { batch: { emphasis: "highlighted" } } },
        { from: "crm", to: "poller", label: "every 5 min", emphasis: "faded", when: { poll: { emphasis: "highlighted" } } },
        { from: "poller", to: "app", emphasis: "faded", when: { poll: { emphasis: "highlighted" } } },
      ],
    },
  ],
  response: { type: "choose_one", of: "options" },
};
