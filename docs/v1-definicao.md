# diorama — definição do V1

Estado: **implementado** (versão 1.0.0). Este documento registra a definição que guiou a implementação; onde a implementação foi além ou decidiu algo em aberto, a seção 15 diz o quê. A referência do que existe hoje é o [README](../README.md) e `shared/schema.ts`.

## 1. Intenção

Um vocabulário visual pequeno e fechado para o agente **mostrar** (explicar, explorar, concluir) e **perguntar** (decidir, aprovar, priorizar) dentro do chat.

Toda visualização é dado estruturado mais relações declaradas. O agente nunca escreve comportamento, layout ou estilo.

## 2. Princípios

1. **Vocabulário fechado.** O agente combina componentes existentes; não há desenho livre, HTML ou wireframe.
2. **Componentes pela forma do dado.** Grafo, árvore, matriz etc., não "diagrama de X". Um mesmo componente serve a vários diagramas consagrados.
3. **Síntese, não dado bruto.** A view mostra a leitura que o agente fez dos dados. Se a tela seria igual sem agente, uma ferramenta dedicada (Grafana, GitLens, Jira) faz melhor.
4. **Retrato, não stream.** Os dados chegam como argumentos da chamada. A view não consulta outros servidores MCP.
5. **Interatividade declarativa.** O agente declara relações (ids, lentes, passos); a view deriva destaque, alternância e navegação.
6. **Resposta tipada e opcional.** Quando há pergunta, a resposta volta ao chat em formato previsível. Quando não há, a view não bloqueia o agente.
7. **Só quando texto não basta.** Perguntas simples e explicações curtas continuam em texto.

## 3. Ponto de partida (MVP anterior)

- Ferramentas: `present_decision`, `record_decision` (só para a view), `list_decisions`.
- Blocos: cartões de opção (sempre presentes), `tradeoff`, `flow`, `timeline`.
- Interação: passar o mouse numa opção destaca os elementos dela em todos os blocos.
- Resposta: escolher uma opção ou "nenhuma destas", com nota livre.
- Registro: `.diorama/decisions.jsonl`.

## 4. Ferramentas no V1

| Ferramenta | Visível ao modelo | Espera resposta | Uso |
|---|---|---|---|
| `present_view` | sim | não | explicar, explorar, concluir |
| `present_decision` | sim | sim | decidir, aprovar, priorizar |
| `record_decision` | não (só a view) | — | grava a resposta no registro |
| `list_decisions` | sim | — | lê o registro |

As duas ferramentas de apresentação compartilham o mesmo envelope (seção 5). `present_decision` acrescenta `question` e `response`. Ficam separadas porque a descrição da ferramenta é o que diz ao modelo se ele deve parar e aguardar.

## 5. Envelope

```
title        título curto
context?     um parágrafo de contexto
blocks[]       1 a 4 componentes (seção 6); cada bloco aceita `id` e `label`
lenses[]?      perspectivas nomeadas (seção 8)
walkthrough[]? narrativa passo a passo (seção 8)

# só em present_decision
question       a pergunta ao usuário
response       { type, of?, depth? } (seção 9)
```

`response.of` é o `id` do bloco cujos itens são respondíveis; sem `of`, a resposta vale para a view inteira. `depth` indica o nível respondível quando o bloco é uma árvore.

**Ids são globais na view.** O mesmo id em dois blocos significa a mesma coisa; é isso que liga o destaque entre blocos.

## 6. Componentes

| Componente | Forma do dado | Cobre | V1 |
|---|---|---|---|
| `cards` | itens com resumo, prós, contras | opções de uma decisão | existe |
| `tradeoff` | itens × eixos, nota 1–5 com motivo | comparação por critérios | existe |
| `graph` | nós + arestas | fluxo, dependências, arquitetura, máquina de estados, pipeline | existe como `flow`; renomear |
| `timeline` | fases com duração, por trilha | plano, rollout, roadmap | existe |
| `tree` | hierarquia | mindmap, hipóteses, quebra de épico, árvore de arquivos | **novo** |
| `matrix` | linhas × colunas × célula | tabela de decisão, cobertura, config por ambiente, mapa de calor | **novo** |
| `steps` | itens ordenados com estado | plano de implementação, checklist, linha de corte | **novo** |

Fora do V1, na ordem em que eu adicionaria: `sequence` (atores × mensagens), `quadrant` (itens em dois eixos), `board` (colunas), `chart` (barras e linhas), eventos pontuais e raias em `timeline`, raias em `graph`.

Mudança em relação ao MVP: os cartões deixam de ser obrigatórios e passam a ser um bloco, já que `present_view` não tem opções.

## 7. Marcadores

Campos opcionais aceitos em qualquer elemento de qualquer componente (nó, aresta, linha, célula, passo, fase):

| Campo | Valores | Uso |
|---|---|---|
| `in` | ids de lentes | a que perspectivas o elemento pertence (substitui `options` do MVP) |
| `refs` | ids de elementos | elementos de outros blocos a que este se refere; focar um destaca os outros |
| `change` | `added`, `removed`, `changed`, `affected` | antes e depois, impacto de mudança |
| `status` | `ok`, `fail`, `running`, `warn`, `pending` | pipeline, testes, progresso |
| `note` | texto curto | aparece ao focar o elemento |

Com `change`, "diff" e "blast radius" são um grafo ou uma matriz com marcadores, sem componente próprio.

## 8. Mecanismos interativos

| Mecanismo | O agente declara | O usuário faz | V1 |
|---|---|---|---|
| Destaque ligado | ids compartilhados entre blocos, ou `refs` | foca um elemento; os de mesmo id e os referenciados acendem nos outros blocos | sim |
| Lentes | `lenses[{id, label, summary?}]` + `in` nos elementos | alterna a lente ativa; o resto fica esmaecido | sim |
| Passo a passo | `walkthrough[{text, focus[]}]`, onde `focus` são ids de elementos ou de uma lente | avança e volta; a view acompanha | sim |
| Perguntar sobre isto | nada | clica num elemento e envia ao chat uma pergunta com o contexto dele | sim |
| Detalhe sob demanda | trecho de código, arquivo:linha por elemento | abre painel; expande e recolhe grupos | depois |
| Filtro | tags, severidade, tempo | filtra ou seleciona intervalo | depois |
| Atualizar | nada | pede ao agente um novo retrato | depois |

As opções de uma decisão são lentes que também aceitam escolha: cada cartão de opção cria uma lente com o mesmo id.

## 9. Tipos de resposta

| Tipo | O usuário | Mensagem que volta ao chat | V1 |
|---|---|---|---|
| `choose_one` | escolhe uma opção ou "nenhuma destas" | opção escolhida + nota | existe |
| `choose_many` | marca vários itens | itens marcados e não marcados + nota | **novo** |
| `approve` | aprova ou rejeita cada item (ou a view inteira, sem `of`) | veredito por item + nota | **novo** |
| `rank` | ordena itens | ordem final | depois |
| `comment` | comenta elementos específicos | comentários por id | depois |

Toda resposta é gravada por `record_decision` antes de ser enviada ao chat. Se o host recusar a mensagem, a view mostra o texto para colar.

## 10. Casos de uso e o que os atende

| Momento | Caso | Componentes | Resposta | V1 cobre |
|---|---|---|---|---|
| Decidir | escolha de arquitetura, escopo, rollout, refatoração | `cards`, `tradeoff`, `graph`, `timeline` | `choose_one` | sim |
| Alinhar | entendimento do sistema, ciclo de vida, modelo de dados | `graph` + passo a passo | nenhuma ou `approve` | sim |
| Alinhar | contrato de API, interação entre serviços | `sequence` | — | não |
| Aprovar | plano de implementação | `steps` | `approve` | sim |
| Aprovar | impacto de mudança, resumo de PR | `graph` ou `tree` com `change` | `approve` | sim |
| Priorizar | linha de corte de escopo | `steps` | `choose_many` | sim |
| Priorizar | backlog, riscos | `quadrant` | `choose_many` | parcial (como `matrix`) |
| Diagnosticar | hipóteses de bug | `tree` com `note` | `choose_one` | sim |
| Diagnosticar | incidente, logs correlacionados | `timeline` com eventos e raias, `matrix` | nenhuma | parcial |
| Diagnosticar | medições antes e depois | `chart` | — | não |
| Especificar | regras de negócio, cenários de teste | `matrix` | `choose_many` | sim |
| Explicar | tour de codebase | `graph` + passo a passo | nenhuma | sim |
| Acompanhar | pipeline de CI/CD | `graph` com `status` | nenhuma | sim |
| Acompanhar | versões por ambiente, testes instáveis | `matrix` com `status` | nenhuma | sim |
| Acompanhar | progresso do próprio agente | `steps` com `status` | nenhuma | sim |
| Git | plano de cherry-pick ou rebase | `steps` | `approve` | sim |
| Git | resolução de conflitos | `cards` por conflito | `choose_one` por item | não |
| Git | grafo de commits | `graph` com raias | — | não |
| Ágil | quebra de épico, dependências entre tickets | `tree`, `graph` | `approve` | sim |
| Ágil | quadro kanban | `board` | — | não |

## 11. Fora do V1

- Desenho livre, wireframes, HTML gerado pelo agente.
- Arrastar e soltar.
- Dados ao vivo ou consulta a outros servidores MCP a partir da view.
- Diagrama de classes UML completo.
- Votação multiusuário e persistência além do JSONL.

## 12. Limites

- Até 4 blocos por view.
- Tetos por componente (o `graph` hoje aceita 24 nós e 40 arestas); `tree`, `matrix` e `steps` terão tetos equivalentes, a definir na implementação.
- Notas em escala grossa (1–5) e sempre com motivo, para desencorajar precisão inventada.

## 13. Decisões tomadas

- **`approve` é por item.** Sem `of`, vale para a view inteira.
- **Ordem do que ficou fora do V1:** `sequence`, `quadrant`, `board`, `chart`.
- **Idioma:** código, schema, descrições de ferramentas e rótulos da view em inglês. Português só nos documentos de descoberta (este e `cenarios.md`).
- **`walkthrough` é o nome da narrativa no envelope**, para não colidir com o componente `steps`.

## 14. Decisões em aberto

1. **Cartões sem decisão.** Em `present_view`, `cards` serve para listar cenários sem escolha, ou fica restrito a `present_decision`?
2. **Registro de views.** `present_view` não gera resposta; gravar ou não no JSONL que a view foi mostrada?

Os cenários de uso, com dados de exemplo e wireframes, estão em [cenarios.md](cenarios.md).

## 15. O que foi implementado

Tudo o que as seções 4 a 9 marcam como V1, mais o que a seção 6 listava como "fora do V1":

- **Os onze componentes**: `cards`, `tradeoff`, `graph`, `timeline`, `tree`, `matrix`, `steps`, `sequence`, `quadrant`, `board`, `chart`.
- **`graph` com variantes** `flow`, `state`, `entity` (nós com campos) e `commits` (raias por branch).
- **`timeline` com eventos pontuais** e marcas de eixo próprias (horários, por exemplo).
- **`choose_one` sobre vários blocos**: `of` aceita de 2 a 4 ids de bloco, uma escolha por bloco (resolução de conflitos).
- **`tree` é uma lista plana** de nós com `parent`, e não aninhada, para o schema JSON não ser recursivo.
- **Verificação de referências no servidor**: ids inexistentes em arestas, notas, `focus`, `response.of` etc. voltam ao modelo como erro, com a lista do que corrigir, em vez de mostrar uma view quebrada.

Decisões da seção 14:

1. `cards` é aceito em `present_view` (lista de cenários sem escolha).
2. Views sem resposta não são gravadas no JSONL.

Continua por fazer: detalhe sob demanda, filtro, atualizar; respostas `rank` e `comment`.

Verificação: os 36 cenários de [cenarios.md](cenarios.md) são validados contra o schema e rodam de ponta a ponta num host de teste (`npm test`). Falta a validação no cliente real.

