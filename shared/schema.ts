import { z } from "zod";

/**
 * Vocabulary shared by the server (validation) and the view (types only).
 * Blocks are named after the shape of the data, not after a diagram type.
 */

/** Coarse scale on purpose: fine-grained numbers would suggest precision the agent does not have. */
export const Level = z.enum(["low", "medium", "high"]);
export const Change = z.enum(["added", "removed", "changed", "affected"]);
export const Status = z.enum(["ok", "fail", "running", "warn", "pending"]);

/**
 * Optional fields accepted on every element of every block.
 * No per-field descriptions: these repeat ~13 times per tool schema, so they are explained once in the tool description (server/index.ts, VOCABULARY).
 */
const markers = {
  in: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  change: Change.optional(),
  status: Status.optional(),
  note: z.string().optional(),
};
const blockBase = {
  id: z.string().optional(),
  label: z.string().optional(),
};
const idLabel = z.object({ id: z.string(), label: z.string() });

const CardsBlock = z.object({
  type: z.literal("cards"),
  ...blockBase,
  items: z
    .array(
      z.object({
        id: z.string().describe("Short stable id, e.g. 'queue'. Other blocks reference it through `in`."),
        title: z.string().describe("2-5 words."),
        summary: z.string().optional().describe("One or two sentences."),
        pros: z.array(z.string()).max(5).optional(),
        cons: z.array(z.string()).max(5).optional(),
        effort: Level.optional(),
        risk: Level.optional(),
        recommended: z.boolean().optional().describe("True on at most one card: the one you would pick."),
        ...markers,
      }),
    )
    .min(2)
    .max(5),
});

const TradeoffBlock = z.object({
  type: z.literal("tradeoff"),
  ...blockBase,
  items: z.array(idLabel).min(2).max(5).describe("What is compared. Reuse the card ids when comparing options."),
  axes: z.array(z.object({ id: z.string(), label: z.string().describe("Phrase it so that higher is better, e.g. 'Low cost'.") })).min(2).max(6),
  scores: z
    .array(z.object({ item: z.string(), axis: z.string(), value: z.number().int().min(1).max(5).describe("1 = worst, 5 = best."), reason: z.string().describe("One line: why this score.") }))
    .describe("One entry per item per axis."),
});

const GraphBlock = z.object({
  type: z.literal("graph"),
  ...blockBase,
  variant: z
    .enum(["flow", "state", "entity", "commits"])
    .optional()
    .describe("flow (default): boxes and arrows. state: state machine. entity: nodes list `fields`. commits: nodes sit on `lanes` in the order given."),
  direction: z.enum(["LR", "TB"]).optional(),
  lanes: z.array(idLabel).max(6).optional().describe("commits variant only: one lane per branch."),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().describe("Under 28 characters."),
        fields: z.array(z.string()).max(8).optional().describe("entity variant: one line per field. Prefix with '+ ', '- ' or '~ ' to mark added, removed, changed."),
        lane: z.string().optional().describe("commits variant: lane id."),
        ...markers,
      }),
    )
    .min(2)
    .max(24),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), dashed: z.boolean().optional(), ...markers })).max(40),
});

const TimelineBlock = z.object({
  type: z.literal("timeline"),
  ...blockBase,
  unit: z.string().optional().describe("Unit of the numbers, e.g. 'days', 'weeks'."),
  end: z.number().positive().optional().describe("Right edge of the scale; defaults to the longest track."),
  ticks: z.array(z.object({ at: z.number(), label: z.string() })).max(12).optional().describe("Custom axis labels, e.g. clock times."),
  tracks: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        phases: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string(),
              duration: z.number().positive(),
              start: z.number().min(0).optional().describe("Defaults to the end of the previous phase."),
              ...markers,
            }),
          )
          .min(1)
          .max(10),
        ...markers,
      }),
    )
    .min(1)
    .max(8),
  events: z
    .array(z.object({ id: z.string().optional(), at: z.number(), label: z.string(), track: z.string().optional().describe("Track id; omit for an event that spans every track."), ...markers }))
    .max(12)
    .optional()
    .describe("Point-in-time markers: deploy, alert, point of no return."),
});

const TreeBlock = z.object({
  type: z.literal("tree"),
  ...blockBase,
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        parent: z.string().optional().describe("Parent node id; omit on the single root."),
        meta: z.string().optional().describe("Short right-aligned text: size, estimate, count."),
        value: z.number().min(0).optional().describe("Draws a bar proportional to the largest value in the tree."),
        valueLabel: z.string().optional(),
        ...markers,
      }),
    )
    .min(2)
    .max(40)
    .describe("Flat list in display order; children follow their parent."),
});

const Cell = z.union([
  z.string(),
  z.object({
    v: z.string().describe("Cell text; may be empty."),
    heat: z.number().min(0).max(5).optional().describe("Heat-map intensity, 0-5."),
    ...markers,
  }),
]);
const MatrixBlock = z.object({
  type: z.literal("matrix"),
  ...blockBase,
  mono: z.boolean().optional().describe("Monospace row labels: config keys, paths."),
  columns: z.array(idLabel).min(1).max(12),
  rows: z.array(z.object({ id: z.string(), label: z.string(), cells: z.array(Cell).describe("One cell per column, in order."), ...markers })).min(1).max(20),
});

const StepsBlock = z.object({
  type: z.literal("steps"),
  ...blockBase,
  numbered: z.boolean().optional().describe("Default true. False for unordered lists: assumptions, risks, evidence."),
  mono: z.boolean().optional().describe("Monospace `detail`: log lines, commands."),
  items: z
    .array(z.object({ id: z.string(), label: z.string(), detail: z.string().optional().describe("One line."), meta: z.string().optional().describe("Short right-aligned text."), ...markers }))
    .min(1)
    .max(20),
});

const SequenceBlock = z.object({
  type: z.literal("sequence"),
  ...blockBase,
  actors: z.array(idLabel).min(2).max(6),
  messages: z
    .array(z.object({ id: z.string().optional(), from: z.string(), to: z.string(), label: z.string(), reply: z.boolean().optional().describe("Dashed return arrow."), ...markers }))
    .min(1)
    .max(24),
});

const axis = z.object({ label: z.string(), low: z.string().optional(), high: z.string().optional() });
const QuadrantBlock = z.object({
  type: z.literal("quadrant"),
  ...blockBase,
  x: axis,
  y: axis,
  quadrants: z.array(z.string()).length(4).optional().describe("Names in order: top-left, top-right, bottom-left, bottom-right."),
  items: z.array(z.object({ id: z.string(), label: z.string(), x: z.number().min(0).max(10), y: z.number().min(0).max(10), ...markers })).min(1).max(20),
});

const BoardBlock = z.object({
  type: z.literal("board"),
  ...blockBase,
  columns: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        limit: z.number().int().positive().optional().describe("WIP limit."),
        items: z.array(z.object({ id: z.string(), label: z.string(), tag: z.string().optional().describe("Short second line."), ...markers })).max(12),
      }),
    )
    .min(2)
    .max(6),
});

const ChartBlock = z.object({
  type: z.literal("chart"),
  ...blockBase,
  kind: z.enum(["bar", "line"]).optional(),
  unit: z.string().optional(),
  categories: z.array(z.string()).min(1).max(24),
  series: z.array(z.object({ id: z.string(), label: z.string(), values: z.array(z.number()).describe("One value per category.") })).min(1).max(4),
});

export const BlockSchema = z.discriminatedUnion("type", [
  CardsBlock,
  TradeoffBlock,
  GraphBlock,
  TimelineBlock,
  TreeBlock,
  MatrixBlock,
  StepsBlock,
  SequenceBlock,
  QuadrantBlock,
  BoardBlock,
  ChartBlock,
]);

const envelope = {
  title: z.string().describe("Short title."),
  context: z.string().optional().describe("One to three sentences of background."),
  blocks: z.array(BlockSchema).min(1).max(4).describe("Ids are global: the same id in two blocks means the same thing and highlights together."),
  lenses: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .max(6)
    .optional()
    .describe("Named perspectives the user can switch between (before/after, happy path/error). Elements opt in through `in`."),
  walkthrough: z
    .array(z.object({ text: z.string().describe("One or two sentences."), focus: z.array(z.string()).describe("Element or lens ids to highlight during this step.") }))
    .max(8)
    .optional()
    .describe("Narrated steps over the blocks. Use it to carry an explanation or a conclusion."),
};

export const ViewSchema = z.object(envelope);

export const ResponseSchema = z.object({
  type: z.enum(["choose_one", "choose_many", "approve"]),
  of: z
    .union([z.string(), z.array(z.string()).min(2).max(4)])
    .optional()
    .describe("Id of the block whose items the user answers on. Required except for `approve`, where omitting it asks for one verdict on the whole view. An array (choose_one only) asks for one choice per block."),
  depth: z.number().int().min(1).max(4).optional().describe("Tree blocks only: which level is answerable. Default 1 (children of the root)."),
});

export const DecisionSchema = z.object({ ...envelope, question: z.string().describe("The question, in one sentence."), response: ResponseSchema });

export const RecordSchema = z.object({
  title: z.string(),
  question: z.string(),
  type: z.string().describe("Response type."),
  picks: z.array(z.object({ id: z.string(), label: z.string(), verdict: z.string(), block: z.string().optional() })),
  note: z.string().optional(),
  message: z.string().describe("The text sent back to the chat."),
});

export type Level = z.infer<typeof Level>;
export type Change = z.infer<typeof Change>;
export type Status = z.infer<typeof Status>;
export type Block = z.infer<typeof BlockSchema>;
export type BlockOf<T extends Block["type"]> = Extract<Block, { type: T }>;
export type View = z.infer<typeof ViewSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Response = z.infer<typeof ResponseSchema>;
export type DecisionRecord = z.infer<typeof RecordSchema>;
export type Markers = { in?: string[]; refs?: string[]; change?: Change; status?: Status; note?: string };
