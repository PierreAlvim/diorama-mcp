// Builds docs/cenarios.md and docs/wireframes/*.svg from docs/scenarios/data-*.mjs.
// Usage: npm run docs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderWireframe } from "./wireframe.mjs";
import partA from "../docs/scenarios/data-a.mjs";
import partB from "../docs/scenarios/data-b.mjs";
import { buildAnswer, targets } from "../ui/src/model.ts";
import { samplePicks } from "./sample.ts";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const scenarios = [...partA, ...partB];
// The message the view posts for the sample state, from the view's own logic, so the catalogue cannot drift from the code.
for (const sc of scenarios)
  sc.returns = sc.args.response
    ? buildAnswer(sc.args, samplePicks(sc.args, sc.sample), sc.sample?.note ?? "", sc.args.response.type === "approve" && targets(sc.args.response).length === 0 ? "approved" : undefined).message
    : null;
mkdirSync(join(docs, "wireframes"), { recursive: true });

function fmt(v, ind = 0, width = 118) {
  const inline = JSON.stringify(v);
  if (v === null || typeof v !== "object" || inline.length + ind <= width) return inline;
  const pad = " ".repeat(ind + 2), end = " ".repeat(ind);
  if (Array.isArray(v)) return "[\n" + v.map((i) => pad + fmt(i, ind + 2, width)).join(",\n") + "\n" + end + "]";
  return "{\n" + Object.entries(v).map(([k, x]) => `${pad}${JSON.stringify(k)}: ${fmt(x, ind + 2, width)}`).join(",\n") + "\n" + end + "}";
}

const GROUP_INTRO = {
  Decidir: "O agente tem alternativas reais e a escolha é cara de reverter. É o que o MVP já faz.",
  Alinhar: "O agente mostra o que entendeu antes de agir, para que o erro de entendimento seja pego cedo.",
  Aprovar: "O agente já sabe o que quer fazer e pede autorização, no todo ou por item.",
  Priorizar: "Há mais itens do que capacidade. O usuário escolhe o que entra.",
  Diagnosticar: "O agente investigou e apresenta hipóteses, evidências ou medições.",
  Especificar: "O agente encontra lacunas na especificação e as torna explícitas.",
  Git: "Histórico, conflitos e transporte de commits entre branches.",
  "CI/CD": "Estado de pipelines e ambientes, como retrato montado pelo agente.",
  "Ágil": "Tickets, sprints e o cruzamento entre o quadro e o que de fato foi entregue.",
  "Além": "Usos fora do ciclo pergunta-resposta: transparência do agente, explicação e auditoria.",
};

const num = (i) => String(i + 1).padStart(2, "0");
const blockTypes = (sc) => [...new Set(sc.args.blocks.map((b) => b.type))];
const tag = (t) => `\`${t}\``;
const responseOf = (sc) => (sc.args.response ? `\`${sc.args.response.type}\`${sc.args.response.of ? (Array.isArray(sc.args.response.of) ? " por bloco" : " por item") : sc.args.response.type === "approve" ? " no todo" : ""}` : "nenhuma");
const full = (sc) => !(sc.needs ?? []).length;

let md = `# diorama — visão de negócio e catálogo de cenários

Documento de descoberta. Reúne a intenção do produto e todos os cenários de uso levantados até aqui, cada um com dados hipotéticos, a chamada de ferramenta que o agente faria e um wireframe da view resultante. A definição técnica do V1 está em [v1-definicao.md](v1-definicao.md).

Os wireframes e as chamadas são gerados a partir de \`docs/scenarios/data-*.mjs\` por \`npm run docs\`. As chamadas são validadas contra o schema real (\`npm run test:scenarios\`) e cada cenário roda de ponta a ponta na view (\`npm run test:e2e\`). Os wireframes são ilustrações estáticas; a view real, com a chamada editável, está no playground (\`npm run preview\`).

## 1. O problema

Agentes de código conversam por texto. Isso funciona para perguntas simples e falha em três situações recorrentes:

- **Comparar.** Três alternativas viram três parágrafos, e a comparação acontece na cabeça do usuário.
- **Entender estrutura.** Fluxos, dependências, estados e hierarquias são descritos em prosa quando são, por natureza, diagramas.
- **Responder em partes.** O usuário quer aprovar quatro passos de um plano e vetar um, e precisa escrever isso por extenso.

As ferramentas de pergunta que os agentes têm hoje oferecem selects, radios e campos de texto. Elas resolvem a resposta, mas não a compreensão que vem antes dela.

## 2. A proposta

Um servidor MCP que dá ao agente um **vocabulário visual pequeno e fechado** para **mostrar** (explicar, explorar, concluir) e **perguntar** (decidir, aprovar, priorizar) dentro do chat.

O agente envia dados estruturados e relações entre eles. A view decide layout, estilo e comportamento. Não há desenho livre: o agente combina componentes existentes, do mesmo modo que combina palavras.

**Para quem:** desenvolvedores que trabalham com agentes de código em clientes que renderizam MCP Apps (hoje, o chat do VS Code).

**O que o usuário ganha:**

- vê a estrutura do que o agente está propondo ou concluindo, em vez de reconstruí-la a partir de texto;
- explora por conta própria (lentes, passo a passo, perguntar sobre um elemento) sem gastar uma rodada de conversa para cada dúvida;
- responde com um clique por item, e a resposta volta ao agente num formato previsível;
- fica com um registro das decisões tomadas.

## 3. Princípios

1. **Vocabulário fechado.** Nada de HTML, wireframe ou canvas livre gerado pelo agente.
2. **Componentes pela forma do dado.** Grafo, árvore, matriz, e não "diagrama de X".
3. **Síntese, não dado bruto.** A view mostra a leitura do agente. Se a tela seria igual sem agente, Grafana, GitLens ou Jira fazem melhor.
4. **Retrato, não stream.** Os dados chegam na chamada; a view não consulta outros servidores.
5. **Interatividade declarativa.** O agente declara relações; a view deriva destaque, lentes e navegação.
6. **Resposta tipada e opcional.** Com pergunta, a resposta é estruturada. Sem pergunta, a view não bloqueia o agente.
7. **Só quando texto não basta.**

## 4. Vocabulário

**Ferramentas.** \`present_view\` mostra e não espera resposta. \`present_decision\` pergunta e espera.

**Componentes.**

| Componente | Forma do dado | Estado |
|---|---|---|
| \`cards\` | itens com resumo, prós e contras | implementado |
| \`tradeoff\` | itens × critérios, nota com motivo | implementado |
| \`graph\` | nós e arestas | implementado (variantes \`flow\`, \`state\`, \`entity\`, \`commits\`) |
| \`timeline\` | fases no tempo, por trilha | implementado |
| \`tree\` | hierarquia | implementado |
| \`matrix\` | linhas × colunas | implementado |
| \`steps\` | itens ordenados | implementado |
| \`sequence\` | atores × mensagens | implementado |
| \`quadrant\` | itens em dois eixos | implementado |
| \`board\` | cartões em colunas | implementado |
| \`chart\` | séries numéricas | implementado |

**Marcadores** (em qualquer elemento): \`in\` (lentes a que pertence), \`refs\` (elementos relacionados), \`change\` (added, removed, changed, affected), \`status\` (ok, fail, running, warn, pending), \`note\`.

**Mecanismos interativos:** destaque ligado, lentes, passo a passo (\`walkthrough\`), perguntar sobre isto. Ainda não implementados: detalhe sob demanda, filtro, atualizar.

**Respostas:** \`choose_one\`, \`choose_many\`, \`approve\` (por item ou no todo); \`choose_one\` aceita vários blocos (uma escolha por bloco). Ainda não implementados: \`rank\`, \`comment\`.

## 5. Mapa de cenários

Todos os cenários rodam com o que está implementado. "Completo" indica que o cenário não depende de nenhum mecanismo ainda por fazer; os demais funcionam, com a limitação descrita no próprio cenário.

| # | Momento | Cenário | Ferramenta | Componentes | Resposta | Completo |
|---|---|---|---|---|---|---|
${scenarios.map((sc, i) => `| ${i + 1} | ${sc.group} | [${sc.title}](#${i + 1}-${sc.slug}) | \`${sc.tool}\` | ${blockTypes(sc).map(tag).join(", ")} | ${responseOf(sc)} | ${full(sc) ? "sim" : "parcial"} |`).join("\n")}

Dos ${scenarios.length} cenários, ${scenarios.filter(full).length} estão completos.

## 6. Como ler cada cenário

- **Situação**, **Por que visual**, **O que o agente mostra**, **Interação**: a descrição de negócio.
- **Mensagem de volta**: o texto que a view envia ao chat quando há resposta.
- **Fontes**: de onde o agente tira os dados antes de chamar a ferramenta (outros MCPs, comandos, leitura de código).
- **Wireframe**: a view num estado de exemplo (uma lente ativa, um passo da narrativa, itens já marcados).
- **Chamada**: os argumentos que o agente enviaria. Em inglês, como o resto do desenvolvimento.

`;

let lastGroup = null;
scenarios.forEach((sc, i) => {
  const file = `${num(i)}-${sc.slug}.svg`;
  writeFileSync(join(docs, "wireframes", file), renderWireframe(sc));
  if (sc.group !== lastGroup) { md += `\n## ${sc.group}\n\n${GROUP_INTRO[sc.group]}\n`; lastGroup = sc.group; }
  const needs = sc.needs ?? [];
  md += `
<a id="${i + 1}-${sc.slug}"></a>

### ${i + 1}. ${sc.title}

**Situação.** ${sc.situation}

**Por que visual.** ${sc.why}

**O que o agente mostra.** ${sc.shows}

**Interação.** ${sc.interaction}

| | |
|---|---|
| Ferramenta | \`${sc.tool}\` |
| Componentes | ${blockTypes(sc).map(tag).join(", ")} |
| Mecanismos | ${sc.mechanisms.join(", ")} |
| Resposta | ${responseOf(sc)} |
| Fontes | ${sc.sources.join(", ")} |
| Ainda não implementado | ${needs.length ? needs.join(", ") : "nada"} |
${sc.returns ? `\n**Mensagem de volta ao chat.**\n\n\`\`\`text\n${sc.returns}\n\`\`\`\n` : ""}
![Wireframe: ${sc.title}](wireframes/${file})

<details>
<summary>Chamada à ferramenta</summary>

\`\`\`json
${fmt({ tool: sc.tool, arguments: sc.args })}
\`\`\`

</details>
`;
});

md += `
## 7. O que os cenários ensinam

- **Sete componentes atendem a maioria dos cenários.** \`sequence\`, \`quadrant\`, \`board\` e \`chart\` aparecem em poucos casos cada; existem porque nesses casos nenhum outro serve.
- **\`matrix\` e \`steps\` são os mais reutilizados.** Aparecem em quase todos os momentos, de permissões a progresso do agente.
- **Os marcadores fazem o trabalho de vários componentes.** Diff, impacto, status de pipeline e cobertura de testes são um grafo, uma árvore ou uma matriz com \`change\` ou \`status\`.
- **\`refs\` é o que liga blocos de natureza diferente.** Uma suposição que aponta para nós do grafo, um risco que aponta para a célula da matriz.
- **O passo a passo é o mecanismo das conclusões.** Sempre que o agente tem algo a concluir (incidente, pipeline, plano de query), a narrativa em passos carrega a conclusão e a view carrega a evidência.

## 8. Limites e pontos fracos

- **Exagero.** Para uma pergunta simples, a view atrapalha. A descrição das ferramentas precisa ensinar o modelo a não usá-las.
- **Precisão inventada.** Notas, posições em quadrante e probabilidades são estimativas do agente. Escalas grossas e motivo obrigatório reduzem o problema, não o eliminam.
- **Custo em tokens.** Uma chamada com três blocos custa mais do que um parágrafo. Tetos por componente limitam o tamanho.
- **Suporte dos clientes.** Depende de o cliente renderizar MCP Apps. Onde não renderiza, resta o resumo em texto.
- **Dados envelhecem.** Um retrato de pipeline ou de quadro está desatualizado minutos depois; a view precisa dizer quando foi gerada.
- **Não substitui as ferramentas dedicadas.** Quem quer monitorar usa o Grafana; a view é para o momento da conversa.

## 9. Próximos passos

1. Validar no cliente real (Copilot no Code): se o modelo escolhe a ferramenta e o componente certos em cada cenário.
2. Mecanismos pendentes: detalhe sob demanda, filtro, atualizar; respostas \`rank\` e \`comment\`.
3. Evoluir este catálogo para um cookbook em inglês: um prompt de exemplo por cenário e a chamada esperada.
`;

writeFileSync(join(docs, "cenarios.md"), md);
console.log(`ok: ${scenarios.length} scenarios, ${scenarios.filter(full).length} complete`);
