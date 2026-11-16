import type { Block } from "../../../shared/schema";
import { Board, Cards, Matrix, Quadrant, Steps, Timeline, Tradeoff, Tree } from "./html";
import { Chart, Graph, Sequence } from "./svg";

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "cards": return <Cards key={i} block={b} />;
          case "tradeoff": return <Tradeoff key={i} block={b} />;
          case "graph": return <Graph key={i} block={b} />;
          case "timeline": return <Timeline key={i} block={b} />;
          case "tree": return <Tree key={i} block={b} />;
          case "matrix": return <Matrix key={i} block={b} />;
          case "steps": return <Steps key={i} block={b} />;
          case "sequence": return <Sequence key={i} block={b} />;
          case "quadrant": return <Quadrant key={i} block={b} />;
          case "board": return <Board key={i} block={b} />;
          case "chart": return <Chart key={i} block={b} />;
          default: return <p key={i} className="muted">Unknown block type: {(b as { type: string }).type}</p>;
        }
      })}
    </>
  );
}
