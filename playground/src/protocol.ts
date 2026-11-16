import type { DecisionRecord } from "../../shared/schema";
import type { Doc } from "../../ui/src/model";

/** Messages between the playground page and the view iframe. The real view talks MCP Apps to its host; this is the same shape, reduced to what a preview needs. */
export type ToFrame = { type: "diorama:render"; doc: Doc | null; theme: "light" | "dark"; run: number };
export type FromFrame =
  | { type: "diorama:ready" }
  | { type: "diorama:size"; height: number }
  | { type: "diorama:record"; record: DecisionRecord }
  | { type: "diorama:send"; text: string };
