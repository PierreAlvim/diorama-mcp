// Scenario catalogue. Prose in pt-BR (discovery), payloads in English.
// `args` is the tool call; `sample` is the example state used by wireframes and e2e tests (never sent by the agent).
export default [
  {
    "slug": "architecture-choice",
    "group": "Decidir",
    "title": "Escolha de arquitetura",
    "situation": "O agente precisa adicionar notificações em tempo real e há três caminhos viáveis, cada um com custo operacional diferente.",
    "why": "Em texto, cada alternativa vira um parágrafo e a comparação fica na cabeça do usuário. Lado a lado, com o fluxo de cada uma destacado, a diferença estrutural aparece.",
    "shows": "Cartões das alternativas, notas por critério com o motivo de cada nota, e um único grafo em que cada alternativa acende os seus nós.",
    "interaction": "Passar o mouse num cartão troca o estado da view: o grafo destaca o caminho daquela alternativa, marca o que ela acrescenta e onde passa a ficar a pressão (pods da API no SSE, Postgres no polling), e a tabela mostra os motivos dela.",
    "sources": ["leitura do código","docs do load balancer"],
    "mechanisms": ["estados (opções)","propriedades por estado (`when`)"],
    "tool": "present_decision",
    "args": {
      "title": "Real-time notifications",
      "context": "The web app polls /notifications every 30s. Product wants updates within 2s. We run 4 stateless API pods behind an ALB.",
      "question": "How should we deliver notifications to the browser?",
      "blocks": [
        {
          "type": "cards",
          "id": "options",
          "items": [
            {
              "id": "ws",
              "title": "WebSocket gateway",
              "summary": "Dedicated gateway service holding bidirectional connections.",
              "pros": ["Bidirectional, lowest latency","Reusable for chat later"],
              "cons": ["New service to run","Sticky sessions on the ALB"],
              "effort": "high",
              "risk": "medium"
            },
            {
              "id": "sse",
              "title": "Server-Sent Events",
              "summary": "One-way stream from the existing API pods, fan-out through Redis pub/sub.",
              "pros": ["Plain HTTP, no new service","Auto-reconnect built in"],
              "cons": ["One-way only","One connection per tab"],
              "effort": "medium",
              "risk": "low",
              "recommended": true
            },
            {
              "id": "poll",
              "title": "Faster polling",
              "summary": "Keep polling, drop the interval to 3s and add ETag caching.",
              "pros": ["No infra change"],
              "cons": ["10× request volume","Never truly real-time"],
              "effort": "low",
              "risk": "low"
            }
          ]
        },
        {
          "type": "tradeoff",
          "items": [{"id":"ws","label":"WebSocket"},{"id":"sse","label":"SSE"},{"id":"poll","label":"Polling"}],
          "axes": [
            {"id":"latency","label":"Low latency"},
            {"id":"ops","label":"Operational simplicity"},
            {"id":"cost","label":"Low infra cost"},
            {"id":"reuse","label":"Future reuse"}
          ],
          "scores": [
            {"item":"ws","axis":"latency","value":5,"reason":"Push over an open socket"},
            {"item":"ws","axis":"ops","value":2,"reason":"New service plus sticky sessions"},
            {"item":"ws","axis":"cost","value":3,"reason":"Two extra pods"},
            {"item":"ws","axis":"reuse","value":5,"reason":"Chat and presence can share it"},
            {"item":"sse","axis":"latency","value":4,"reason":"Push; ~100 ms through Redis pub/sub"},
            {"item":"sse","axis":"ops","value":4,"reason":"Runs in the existing API pods"},
            {"item":"sse","axis":"cost","value":4,"reason":"Only Redis pub/sub added"},
            {"item":"sse","axis":"reuse","value":3,"reason":"Server-to-client only"},
            {"item":"poll","axis":"latency","value":2,"reason":"Up to 3 s by design"},
            {"item":"poll","axis":"ops","value":5,"reason":"Nothing new to run"},
            {"item":"poll","axis":"cost","value":2,"reason":"10× requests on API and DB"},
            {"item":"poll","axis":"reuse","value":1,"reason":"Dead end"}
          ]
        },
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"browser","label":"Browser"},
            {"id":"alb","label":"ALB"},
            {"id":"api","label":"API pods","when":{"sse":{"status":"warn","note":"one open connection per tab"}}},
            {"id":"gw","label":"WS gateway","emphasis":"faded","when":{"ws":{"emphasis":"highlighted","change":"added","note":"new service to run"}}},
            {
              "id": "redis",
              "label": "Redis pub/sub",
              "emphasis": "faded",
              "when": {"ws":{"emphasis":"highlighted","change":"added"},"sse":{"emphasis":"highlighted","change":"added"}}
            },
            {"id":"worker","label":"Notifier worker"},
            {"id":"db","label":"Postgres","when":{"poll":{"status":"warn","note":"10x the read load"}}}
          ],
          "edges": [
            {"from":"browser","to":"alb"},
            {"from":"alb","to":"api","label":"SSE stream","emphasis":"faded","when":{"sse":{"emphasis":"highlighted"}}},
            {"from":"alb","to":"api","label":"GET every 3s","emphasis":"faded","when":{"poll":{"emphasis":"highlighted"}}},
            {"from":"alb","to":"gw","label":"ws://","emphasis":"faded","when":{"ws":{"emphasis":"highlighted"}}},
            {
              "from": "worker",
              "to": "redis",
              "label": "publish",
              "emphasis": "faded",
              "when": {"ws":{"emphasis":"highlighted"},"sse":{"emphasis":"highlighted"}}
            },
            {"from":"redis","to":"api","emphasis":"faded","when":{"sse":{"emphasis":"highlighted"}}},
            {"from":"redis","to":"gw","emphasis":"faded","when":{"ws":{"emphasis":"highlighted"}}},
            {"from":"worker","to":"db"},
            {"from":"api","to":"db","label":"query","emphasis":"faded","when":{"poll":{"emphasis":"highlighted"}}}
          ]
        }
      ],
      "response": {"type":"choose_one","of":"options"}
    },
    "sample": {"lens":"sse","pick":"sse","note":"keep polling as fallback for the legacy mobile app"}
  },
  {
    "slug": "feature-scoping",
    "group": "Decidir",
    "title": "Escopo de uma feature",
    "situation": "O pedido é \"exportar relatórios\". O agente enxerga três tamanhos possíveis de entrega e precisa saber qual construir.",
    "why": "O que diferencia os escopos é o que entra e quanto demora; uma linha do tempo por escopo mostra as duas coisas de uma vez.",
    "shows": "Um cartão por escopo e uma trilha de fases por escopo na mesma escala de tempo.",
    "interaction": "O cartão em foco destaca a trilha correspondente.",
    "sources": ["ticket de origem","leitura do código"],
    "mechanisms": ["estados (opções)","destaque ligado"],
    "tool": "present_decision",
    "args": {
      "title": "Report export scope",
      "context": "Ticket PROJ-812 asks for \"export reports\". Reports can reach 400k rows; the API has a 30s request timeout.",
      "question": "Which scope should I build?",
      "blocks": [
        {
          "type": "cards",
          "id": "options",
          "items": [
            {
              "id": "minimal",
              "title": "Minimal",
              "summary": "Synchronous CSV of the current view, capped at 10k rows.",
              "pros": ["Ships this week"],
              "cons": ["Fails for large reports"],
              "effort": "low"
            },
            {
              "id": "standard",
              "title": "Standard",
              "summary": "Background job, CSV and XLSX, emailed link when ready.",
              "pros": ["Handles 400k rows","Reuses the job queue"],
              "cons": ["Needs file storage and expiry"],
              "effort": "medium",
              "recommended": true
            },
            {
              "id": "full",
              "title": "Full",
              "summary": "Standard plus scheduled recurring exports and a download history page.",
              "pros": ["Covers the finance team request"],
              "cons": ["New UI surface","Scheduler to maintain"],
              "effort": "high"
            }
          ]
        },
        {
          "type": "timeline",
          "unit": "days",
          "tracks": [
            {"id":"minimal","label":"Minimal","phases":[{"label":"Endpoint","duration":2},{"label":"UI","duration":1}]},
            {
              "id": "standard",
              "label": "Standard",
              "phases": [{"label":"Job + storage","duration":4},{"label":"XLSX","duration":2},{"label":"Email + UI","duration":2}]
            },
            {
              "id": "full",
              "label": "Full",
              "phases": [
                {"label":"Job + storage","duration":4},
                {"label":"XLSX","duration":2},
                {"label":"Email + UI","duration":2},
                {"label":"Scheduler","duration":4},
                {"label":"History page","duration":3}
              ]
            }
          ]
        }
      ],
      "response": {"type":"choose_one","of":"options"}
    },
    "sample": {"lens":"standard","pick":"standard"}
  },
  {
    "slug": "migration-rollout",
    "group": "Decidir",
    "title": "Plano de migração ou rollout",
    "situation": "Sessões de usuário vão sair do Postgres para o Redis. A dúvida não é o destino, é o caminho: quanto risco e quanto tempo de convivência entre os dois.",
    "why": "Estratégias de rollout diferem em duração, sobreposição e ponto sem volta, tudo temporal.",
    "shows": "Cartões das estratégias e uma linha do tempo com as fases de cada uma, com o ponto sem volta marcado.",
    "interaction": "O cartão em foco destaca a trilha da estratégia.",
    "sources": ["leitura do código","métricas de sessões ativas"],
    "mechanisms": ["estados (opções)","destaque ligado"],
    "tool": "present_decision",
    "args": {
      "title": "Session store migration",
      "context": "1.2M active sessions in Postgres `sessions`. Sessions live 14 days. Logging everyone out is acceptable only outside business hours.",
      "question": "How do we move sessions to Redis?",
      "blocks": [
        {
          "type": "cards",
          "id": "options",
          "items": [
            {
              "id": "bigbang",
              "title": "Big bang",
              "summary": "Deploy Redis-only and invalidate all sessions on a Sunday night.",
              "pros": ["Simplest code","Done in one release"],
              "cons": ["Everyone logs in again","No gradual signal"],
              "effort": "low",
              "risk": "high"
            },
            {
              "id": "dual",
              "title": "Dual-write, then cut over",
              "summary": "Write to both, read from Redis with Postgres fallback, drop Postgres after 14 days.",
              "pros": ["No forced logout","Rollback is a flag flip"],
              "cons": ["Two code paths for 2 weeks"],
              "effort": "medium",
              "risk": "low",
              "recommended": true
            },
            {
              "id": "tenant",
              "title": "Tenant by tenant",
              "summary": "Move tenants in waves behind a per-tenant flag.",
              "pros": ["Smallest blast radius"],
              "cons": ["Longest","Flag bookkeeping"],
              "effort": "high",
              "risk": "low"
            }
          ]
        },
        {
          "type": "timeline",
          "unit": "days",
          "tracks": [
            {"id":"bigbang","label":"Big bang","phases":[{"label":"Build","duration":3},{"label":"Cut","duration":1}]},
            {
              "id": "dual",
              "label": "Dual-write",
              "phases": [{"label":"Build","duration":4},{"label":"Dual-write + fallback read","duration":14},{"label":"Drop PG","duration":2}]
            },
            {
              "id": "tenant",
              "label": "Tenant by tenant",
              "phases": [
                {"label":"Build + flags","duration":6},
                {"label":"Wave 1","duration":5},
                {"label":"Wave 2","duration":5},
                {"label":"Wave 3","duration":5},
                {"label":"Drop PG","duration":2}
              ]
            }
          ],
          "events": [
            {"at":4,"track":"bigbang","label":"no way back","change":"removed"},
            {"at":18,"track":"dual","label":"no way back","change":"removed"},
            {"at":21,"track":"tenant","label":"no way back","change":"removed"}
          ]
        }
      ],
      "response": {"type":"choose_one","of":"options"}
    },
    "sample": {"lens":"dual","pick":"dual"}
  },
  {
    "slug": "refactoring-strategy",
    "group": "Decidir",
    "title": "Estratégia de refatoração",
    "situation": "Uma classe `OrderService` de 2.400 linhas concentra preço, estoque e faturamento. O agente propõe formas de quebrá-la.",
    "why": "O que muda entre as estratégias é a forma final do grafo de dependências; mostrar o grafo com o que é adicionado e removido torna isso concreto.",
    "shows": "Cartões das estratégias e o grafo de módulos com marcadores de mudança, filtrado pela estratégia em foco.",
    "interaction": "Cada cartão é uma lente sobre o grafo: mostra os módulos novos e os que somem naquela estratégia.",
    "sources": ["leitura do código","grafo de imports"],
    "mechanisms": ["estados (opções)","marcadores `change`"],
    "tool": "present_decision",
    "args": {
      "title": "Breaking up OrderService",
      "context": "OrderService.ts is 2,400 lines, imported by 31 files, and owns pricing, stock reservation and invoicing.",
      "question": "Which refactoring strategy should I follow?",
      "blocks": [
        {
          "type": "cards",
          "id": "options",
          "items": [
            {
              "id": "domain",
              "title": "Extract by domain",
              "summary": "Pull Pricing, Stock and Invoicing into their own modules; OrderService becomes an orchestrator.",
              "pros": ["Clear ownership","Each step is shippable"],
              "cons": ["31 import sites to update"],
              "effort": "medium",
              "risk": "medium",
              "recommended": true
            },
            {
              "id": "facade",
              "title": "Facade first",
              "summary": "Keep the public API, move internals behind a facade, split later.",
              "pros": ["Callers untouched"],
              "cons": ["Two layers until phase 2","Easy to stop halfway"],
              "effort": "low",
              "risk": "low"
            },
            {
              "id": "rewrite",
              "title": "Rewrite as pipeline",
              "summary": "Replace with an explicit order pipeline of steps.",
              "pros": ["Best final design"],
              "cons": ["Big-bang switch","Behaviour drift risk"],
              "effort": "high",
              "risk": "high"
            }
          ]
        },
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"ctrl","label":"OrderController"},
            {"id":"svc","label":"OrderService","change":"changed"},
            {"id":"order-facade","label":"OrderFacade","change":"added"},
            {
              "id": "pricing",
              "label": "Pricing",
              "change": "added",
              "emphasis": "faded",
              "when": {"domain":{"emphasis":"highlighted"},"rewrite":{"emphasis":"highlighted"}}
            },
            {
              "id": "stock",
              "label": "Stock",
              "change": "added",
              "emphasis": "faded",
              "when": {"domain":{"emphasis":"highlighted"},"rewrite":{"emphasis":"highlighted"}}
            },
            {
              "id": "invoice",
              "label": "Invoicing",
              "change": "added",
              "emphasis": "faded",
              "when": {"domain":{"emphasis":"highlighted"},"rewrite":{"emphasis":"highlighted"}}
            },
            {"id":"pipe","label":"OrderPipeline","change":"added","emphasis":"faded","when":{"rewrite":{"emphasis":"highlighted"}}},
            {"id":"repo","label":"OrderRepo"}
          ],
          "edges": [
            {"from":"ctrl","to":"svc","emphasis":"faded","when":{"domain":{"emphasis":"highlighted"}}},
            {"from":"ctrl","to":"order-facade","emphasis":"faded","when":{"facade":{"emphasis":"highlighted"}}},
            {"from":"order-facade","to":"svc","emphasis":"faded","when":{"facade":{"emphasis":"highlighted"}}},
            {"from":"ctrl","to":"pipe","emphasis":"faded","when":{"rewrite":{"emphasis":"highlighted"}}},
            {"from":"svc","to":"pricing","emphasis":"faded","when":{"domain":{"emphasis":"highlighted"}}},
            {"from":"svc","to":"stock","emphasis":"faded","when":{"domain":{"emphasis":"highlighted"}}},
            {"from":"svc","to":"invoice","emphasis":"faded","when":{"domain":{"emphasis":"highlighted"}}},
            {"from":"pipe","to":"pricing","emphasis":"faded","when":{"rewrite":{"emphasis":"highlighted"}}},
            {"from":"pipe","to":"stock","emphasis":"faded","when":{"rewrite":{"emphasis":"highlighted"}}},
            {"from":"pipe","to":"invoice","emphasis":"faded","when":{"rewrite":{"emphasis":"highlighted"}}},
            {"from":"svc","to":"repo"}
          ]
        }
      ],
      "response": {"type":"choose_one","of":"options"}
    },
    "sample": {"lens":"domain","pick":"domain"}
  },
  {
    "slug": "decision-records",
    "group": "Decidir",
    "title": "Registro de decisões (ADR)",
    "situation": "No meio de uma tarefa, o usuário pergunta \"por que mesmo escolhemos SSE?\". O agente consulta o registro e mostra o histórico.",
    "why": "Decisões passadas são tabulares: quando, o que foi escolhido, o que foi descartado. Uma matriz é mais rápida de varrer do que uma lista em prosa.",
    "shows": "Uma matriz com uma linha por decisão registrada e a decisão em questão destacada.",
    "interaction": "Clicar numa linha envia ao chat uma pergunta sobre aquela decisão.",
    "sources": ["`list_decisions` (diorama)"],
    "mechanisms": ["perguntar sobre isto","passo a passo"],
    "tool": "present_view",
    "args": {
      "title": "Decisions recorded in this project",
      "context": "From .diorama/decisions.jsonl — 5 decisions since 2026-10-28.",
      "blocks": [
        {
          "type": "matrix",
          "columns": [{"id":"date","label":"Date"},{"id":"chosen","label":"Chosen"},{"id":"considered","label":"Also considered"}],
          "rows": [
            {"id":"d1","label":"Real-time notifications","cells":["2026-10-28","Server-Sent Events","WebSocket, polling"]},
            {"id":"d2","label":"Report export scope","cells":["2026-10-30","Standard","Minimal, Full"]},
            {"id":"d3","label":"Session store migration","cells":["2026-11-03","Dual-write","Big bang, per tenant"]},
            {"id":"d4","label":"Breaking up OrderService","cells":["2026-11-06","Extract by domain","Facade, rewrite"]},
            {"id":"d5","label":"Rate limiter storage","cells":["2026-11-12","None of these","Redis, in-memory"]}
          ]
        }
      ],
      "walkthrough": [
        {
          "text": "SSE was chosen on Oct 28 over WebSocket because it runs in the existing API pods; the note asked to keep polling as a fallback for the legacy mobile app.",
          "focus": ["d1"]
        }
      ]
    },
    "sample": {"step":0}
  },
  {
    "slug": "system-understanding",
    "group": "Alinhar",
    "title": "Confirmar o entendimento do sistema",
    "situation": "Antes de mexer no checkout, o agente leu o código e montou um modelo de como ele funciona. Se o modelo estiver errado, tudo que vier depois estará errado.",
    "why": "O usuário corrige um diagrama em segundos; corrigir três parágrafos de descrição exige ler tudo.",
    "shows": "O grafo dos componentes como o agente os entendeu e a lista de suposições que ele está fazendo.",
    "interaction": "O passo a passo percorre as suposições e destaca no grafo os elementos a que cada uma se refere. O usuário aprova ou rejeita cada uma.",
    "sources": ["leitura do código"],
    "mechanisms": ["passo a passo"],
    "tool": "present_decision",
    "args": {
      "title": "How checkout works today",
      "context": "My reading of services/checkout, services/payments and the queue consumers. I will base the change on this.",
      "question": "Is this how it works? Reject anything I got wrong.",
      "blocks": [
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"web","label":"Web app"},
            {"id":"checkout","label":"Checkout API"},
            {"id":"inv","label":"Inventory"},
            {"id":"pay","label":"Payments"},
            {"id":"psp","label":"Stripe"},
            {"id":"q","label":"orders queue"},
            {"id":"ful","label":"Fulfilment worker"},
            {"id":"mail","label":"Mailer"}
          ],
          "edges": [
            {"from":"web","to":"checkout","label":"POST /checkout"},
            {"from":"checkout","to":"inv","label":"1 reserve"},
            {"from":"checkout","to":"pay","label":"2 authorise"},
            {"from":"pay","to":"psp"},
            {"from":"checkout","to":"q","label":"3 publish"},
            {"from":"q","to":"ful"},
            {"from":"ful","to":"mail"}
          ]
        },
        {
          "type": "steps",
          "id": "assumptions",
          "label": "What I am assuming",
          "numbered": false,
          "items": [
            {"id":"a1","label":"Payment authorisation is synchronous","detail":"checkout waits for Stripe before answering the browser"},
            {"id":"a2","label":"Capture happens later, in the fulfilment worker"},
            {"id":"a3","label":"Inventory is reserved before payment","detail":"a failed payment releases the reservation"},
            {"id":"a4","label":"The confirmation email is sent by the worker, not the API"}
          ]
        }
      ],
      "response": {"type":"approve","of":"assumptions"},
      "walkthrough": [
        {"text":"Payment authorisation is synchronous: checkout waits for Stripe before answering the browser.","focus":["a1","pay","psp"]},
        {"text":"Capture happens later, in the fulfilment worker.","focus":["a2","ful"]},
        {"text":"Inventory is reserved before payment: a failed payment releases the reservation.","focus":["a3","inv"]},
        {"text":"The confirmation email is sent by the worker, not the API.","focus":["a4","mail"]}
      ]
    },
    "sample": {"step":2,"picks":{"a1":"ok","a2":"ok","a3":"no","a4":"ok"},"note":"inventory is reserved AFTER payment authorisation, not before"}
  },
  {
    "slug": "entity-lifecycle",
    "group": "Alinhar",
    "title": "Ciclo de vida de uma entidade",
    "situation": "O agente vai implementar pausa de assinatura e precisa do mapa de estados atual, incluindo os caminhos de cobrança falha.",
    "why": "Transições faltando ou estados sem saída são invisíveis em código espalhado e óbvios num diagrama de estados.",
    "shows": "A máquina de estados da assinatura, com lentes para cada jornada e a transição proposta marcada como adição.",
    "interaction": "Alternar a lente isola o caminho feliz, a cobrança falha ou o cancelamento.",
    "sources": ["leitura do código","enum de status no schema"],
    "mechanisms": ["estados (lentes)","marcadores `change` e `status`","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Subscription lifecycle",
      "context": "States from the `subscription_status` enum and the transitions I found in billing/. Green is what pausing would add.",
      "lenses": [
        {"id":"happy","label":"Happy path"},
        {"id":"dunning","label":"Failed payment"},
        {"id":"cancel","label":"Cancellation"},
        {"id":"pause","label":"Proposed: pause"}
      ],
      "blocks": [
        {
          "type": "graph",
          "variant": "state",
          "direction": "LR",
          "nodes": [
            {"id":"trial","label":"trialing","emphasis":"faded","when":{"happy":{"emphasis":"highlighted"}}},
            {
              "id": "active",
              "label": "active",
              "emphasis": "faded",
              "when": {
                "happy": {"emphasis":"highlighted"},
                "dunning": {"emphasis":"highlighted"},
                "cancel": {"emphasis":"highlighted"},
                "pause": {"emphasis":"highlighted"}
              }
            },
            {"id":"pastdue","label":"past_due","emphasis":"faded","when":{"dunning":{"emphasis":"highlighted"}}},
            {
              "id": "unpaid",
              "label": "unpaid",
              "status": "warn",
              "note": "No transition leaves this state",
              "emphasis": "faded",
              "when": {"dunning":{"emphasis":"highlighted"}}
            },
            {"id":"paused","label":"paused","change":"added","emphasis":"faded","when":{"pause":{"emphasis":"highlighted"}}},
            {"id":"canceled","label":"canceled","emphasis":"faded","when":{"cancel":{"emphasis":"highlighted"},"dunning":{"emphasis":"highlighted"}}}
          ],
          "edges": [
            {"from":"trial","to":"active","label":"first charge","emphasis":"faded","when":{"happy":{"emphasis":"highlighted"}}},
            {"from":"active","to":"pastdue","label":"charge failed","emphasis":"faded","when":{"dunning":{"emphasis":"highlighted"}}},
            {"from":"pastdue","to":"active","label":"retry ok","emphasis":"faded","when":{"dunning":{"emphasis":"highlighted"}}},
            {"from":"pastdue","to":"unpaid","label":"3 retries","emphasis":"faded","when":{"dunning":{"emphasis":"highlighted"}}},
            {"from":"active","to":"canceled","label":"user cancels","emphasis":"faded","when":{"cancel":{"emphasis":"highlighted"}}},
            {"from":"trial","to":"canceled","label":"trial ends","emphasis":"faded","when":{"cancel":{"emphasis":"highlighted"}}},
            {"from":"active","to":"paused","label":"pause","change":"added","emphasis":"faded","when":{"pause":{"emphasis":"highlighted"}}},
            {"from":"paused","to":"active","label":"resume","change":"added","emphasis":"faded","when":{"pause":{"emphasis":"highlighted"}}}
          ]
        }
      ]
    },
    "sample": {"lens":"dunning"}
  },
  {
    "slug": "data-model-change",
    "group": "Alinhar",
    "title": "Modelagem de dados e mudança de schema",
    "situation": "O produto vai passar de contas individuais para organizações com vários membros. O agente propõe o novo modelo e as migrações.",
    "why": "Um diagrama de entidades com o diff marcado mostra de uma vez o que nasce, o que muda e que relações passam a existir.",
    "shows": "As entidades com campos adicionados e alterados, e a sequência de migrações para aprovar uma a uma.",
    "interaction": "O passo a passo percorre as migrações e destaca as tabelas que cada uma toca.",
    "sources": ["schema atual","leitura dos models"],
    "mechanisms": ["marcadores `change`","passo a passo"],
    "tool": "present_decision",
    "args": {
      "title": "Organisations data model",
      "context": "Today every project belongs to one user. This adds organisations and memberships.",
      "question": "Approve the model and each migration?",
      "blocks": [
        {
          "type": "graph",
          "variant": "entity",
          "direction": "LR",
          "nodes": [
            {"id":"users","label":"users","fields":["id uuid","email text"]},
            {"id":"orgs","label":"organisations","change":"added","fields":["+ id uuid","+ name text","+ plan text"]},
            {"id":"members","label":"memberships","change":"added","fields":["+ user_id uuid","+ org_id uuid","+ role text"]},
            {"id":"projects","label":"projects","change":"changed","fields":["id uuid","+ org_id uuid","- owner_id uuid","name text"]}
          ],
          "edges": [
            {"from":"users","to":"members","label":"1..n","change":"added"},
            {"from":"orgs","to":"members","label":"1..n","change":"added"},
            {"from":"orgs","to":"projects","label":"1..n","change":"added"},
            {"from":"users","to":"projects","label":"owner","change":"removed"}
          ]
        },
        {
          "type": "steps",
          "id": "migrations",
          "label": "Migrations, in order",
          "items": [
            {"id":"m1","label":"Create organisations and memberships","meta":"additive"},
            {"id":"m2","label":"Backfill: one personal organisation per user","meta":"~40k rows"},
            {"id":"m3","label":"Add projects.org_id and backfill from owner","meta":"additive"},
            {"id":"m4","label":"Drop projects.owner_id","meta":"destructive","change":"removed"}
          ]
        }
      ],
      "response": {"type":"approve","of":"migrations"},
      "walkthrough": [
        {"text":"Create organisations and memberships (additive).","focus":["m1","orgs","members"]},
        {"text":"Backfill: one personal organisation per user (~40k rows).","focus":["m2","orgs","members","users"]},
        {"text":"Add projects.org_id and backfill from owner (additive).","focus":["m3","projects"]},
        {"text":"Drop projects.owner_id (destructive).","focus":["m4","projects"]}
      ]
    },
    "sample": {"step":2,"picks":{"m1":"ok","m2":"ok","m3":"ok","m4":"no"},"note":"keep projects.owner_id for one release"}
  },
  {
    "slug": "api-contract",
    "group": "Alinhar",
    "title": "Contrato de API e interação entre serviços",
    "situation": "O agente vai integrar um novo provedor de pagamento e precisa alinhar a ordem das chamadas entre cliente, API e provedor, incluindo o caso de recusa.",
    "why": "Ordem e direção de mensagens entre vários atores é exatamente o que um diagrama de sequência representa.",
    "shows": "Um diagrama de sequência com lentes para o caminho de sucesso e o de pagamento recusado.",
    "interaction": "Alternar a lente mostra quais mensagens existem em cada caminho.",
    "sources": ["docs do provedor","leitura do código"],
    "mechanisms": ["estados (lentes)","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Payment flow with the new provider",
      "context": "Proposed call sequence for POST /orders. The webhook is the source of truth for the final status.",
      "lenses": [{"id":"ok","label":"Payment approved"},{"id":"declined","label":"Payment declined"}],
      "blocks": [
        {
          "type": "sequence",
          "actors": [{"id":"client","label":"Client"},{"id":"api","label":"Orders API"},{"id":"pay","label":"Payments"},{"id":"psp","label":"Provider"}],
          "messages": [
            {"from":"client","to":"api","label":"POST /orders"},
            {"from":"api","to":"pay","label":"createIntent(orderId, amount)"},
            {"from":"pay","to":"psp","label":"POST /intents"},
            {"from":"psp","to":"pay","label":"201 intent (pending)","reply":true},
            {"from":"api","to":"client","label":"202 { orderId, status: pending }","reply":true},
            {"from":"psp","to":"pay","label":"webhook: intent.succeeded","emphasis":"faded","when":{"ok":{"emphasis":"highlighted"}}},
            {"from":"pay","to":"api","label":"markPaid(orderId)","emphasis":"faded","when":{"ok":{"emphasis":"highlighted"}}},
            {"from":"psp","to":"pay","label":"webhook: intent.failed","emphasis":"faded","when":{"declined":{"emphasis":"highlighted"}}},
            {"from":"pay","to":"api","label":"markFailed(orderId, reason)","emphasis":"faded","when":{"declined":{"emphasis":"highlighted"}}},
            {"from":"api","to":"api","label":"release stock","emphasis":"faded","when":{"declined":{"emphasis":"highlighted"}}}
          ]
        }
      ]
    },
    "sample": {"lens":"declined"}
  },
  {
    "slug": "implementation-plan",
    "group": "Aprovar",
    "title": "Plano de implementação",
    "situation": "Antes de escrever código para uma mudança de vários arquivos, o agente apresenta o plano.",
    "why": "O usuário quer cortar ou vetar passos específicos sem reescrever o plano. Uma lista com veredito por item faz isso com um clique por passo.",
    "shows": "Os passos na ordem de execução, com os arquivos de cada um.",
    "interaction": "Aprovar ou rejeitar cada passo; a nota explica a rejeição.",
    "sources": ["leitura do código"],
    "mechanisms": ["resposta `approve` por item"],
    "tool": "present_decision",
    "args": {
      "title": "Rate limiting on the public API",
      "context": "Token bucket per API key, stored in Redis, 600 requests/min by default.",
      "question": "Approve the plan? Reject any step you want out.",
      "blocks": [
        {
          "type": "steps",
          "id": "plan",
          "items": [
            {
              "id": "s1",
              "label": "Add RateLimiter with a Redis token bucket",
              "detail": "src/lib/rate-limiter.ts (new), src/lib/redis.ts",
              "meta": "~120 lines"
            },
            {
              "id": "s2",
              "label": "Middleware that resolves the API key and applies the limit",
              "detail": "src/middleware/rate-limit.ts (new), src/server.ts",
              "meta": "~60 lines"
            },
            {"id":"s3","label":"Per-plan limits in configuration","detail":"config/limits.yaml (new), src/config.ts","meta":"~30 lines"},
            {"id":"s4","label":"Admin page to edit limits per customer","detail":"web/admin/limits/* (new), src/routes/admin.ts","meta":"~300 lines"},
            {
              "id": "s5",
              "label": "Return 429 with Retry-After and X-RateLimit-* headers",
              "detail": "src/middleware/rate-limit.ts, docs/api.md",
              "meta": "~40 lines"
            },
            {"id":"s6","label":"Tests: bucket refill, burst, key isolation","detail":"test/rate-limiter.test.ts (new)","meta":"~150 lines"}
          ]
        }
      ],
      "response": {"type":"approve","of":"plan"}
    },
    "sample": {"picks":{"s1":"ok","s2":"ok","s3":"ok","s4":"no","s5":"ok","s6":"ok"},"note":"no admin UI for now, config file is enough"}
  },
  {
    "slug": "blast-radius",
    "group": "Aprovar",
    "title": "Impacto de uma mudança (blast radius)",
    "situation": "O usuário pediu para renomear um campo. O agente descobre que a mudança atravessa API pública, eventos e um job de exportação.",
    "why": "\"Afeta 14 arquivos\" não diz nada; ver quais módulos mudam e quais são afetados indiretamente mostra o risco real.",
    "shows": "O grafo de módulos com o que muda e o que é afetado, e a árvore dos arquivos tocados.",
    "interaction": "Cada arquivo tem o id do módulo a que pertence: focar um módulo destaca o arquivo dele na árvore, e vice-versa.",
    "sources": ["busca por referências","grafo de imports"],
    "mechanisms": ["marcadores `change`","destaque ligado"],
    "tool": "present_decision",
    "args": {
      "title": "Renaming User.email to primaryEmail",
      "context": "14 files across 5 modules. Two effects leave the codebase: the public API response and the `user.updated` event payload.",
      "question": "Go ahead with a change this wide?",
      "blocks": [
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"model","label":"User model","change":"changed"},
            {"id":"auth","label":"auth","change":"changed"},
            {"id":"api","label":"public API v2","change":"changed"},
            {"id":"events","label":"event bus","change":"changed"},
            {"id":"export","label":"CRM export job","change":"affected"},
            {"id":"partners","label":"Partner integrations","change":"affected"},
            {"id":"billing","label":"billing"}
          ],
          "edges": [
            {"from":"model","to":"auth"},
            {"from":"model","to":"api"},
            {"from":"model","to":"events"},
            {"from":"events","to":"export","label":"user.updated"},
            {"from":"api","to":"partners","label":"GET /users"},
            {"from":"model","to":"billing"}
          ]
        },
        {
          "type": "tree",
          "label": "Files",
          "nodes": [
            {"id":"root","label":"src/"},
            {"id":"model","label":"models/user.ts","change":"changed","meta":"+6 −6","parent":"root"},
            {"id":"f-mig","label":"migrations/2026_11_rename_email.sql","change":"added","meta":"+9","parent":"root"},
            {"id":"auth","label":"auth/ (4 files)","change":"changed","meta":"+11 −11","parent":"root"},
            {"id":"api","label":"api/v2/users.ts","change":"changed","meta":"+3 −3","note":"response shape changes","parent":"root"},
            {"id":"events","label":"events/user-updated.ts","change":"changed","meta":"+2 −2","note":"payload changes","parent":"root"},
            {"id":"export","label":"jobs/crm-export.ts","change":"affected","note":"reads payload.email","parent":"root"}
          ]
        }
      ],
      "response": {"type":"approve"}
    },
    "sample": {"hover":"api","note":"keep `email` in the public API response as a deprecated alias"}
  },
  {
    "slug": "pr-summary",
    "group": "Aprovar",
    "title": "Resumo de um PR agrupado por intenção",
    "situation": "O agente terminou uma tarefa longa e o diff tem 23 arquivos. O usuário precisa revisar sem se perder na ordem alfabética.",
    "why": "Agrupar arquivos pelo propósito da mudança transforma um diff plano numa explicação; a árvore dá a hierarquia intenção → arquivo.",
    "shows": "Uma árvore com um grupo por intenção e os arquivos de cada grupo, com tipo de mudança e tamanho.",
    "interaction": "Aprovar ou rejeitar por grupo; clicar num arquivo pergunta ao agente sobre ele.",
    "sources": ["`git diff`","MCP do GitHub/GitLab"],
    "mechanisms": ["marcadores `change`","resposta `approve` por item","perguntar sobre isto"],
    "tool": "present_decision",
    "args": {
      "title": "PR #482 — Rate limiting on the public API",
      "context": "23 files, +612 −88. Grouped by why each change exists.",
      "question": "Approve each group?",
      "blocks": [
        {
          "type": "tree",
          "id": "groups",
          "nodes": [
            {"id":"pr","label":"PR #482"},
            {"id":"g1","label":"Rate limiter core","meta":"+270 −0","parent":"pr"},
            {"id":"g1a","label":"src/lib/rate-limiter.ts","change":"added","meta":"+124","parent":"g1"},
            {"id":"g1b","label":"test/rate-limiter.test.ts","change":"added","meta":"+146","parent":"g1"},
            {"id":"g2","label":"Wiring into the request path","meta":"+98 −12","parent":"pr"},
            {"id":"g2a","label":"src/middleware/rate-limit.ts","change":"added","meta":"+64","parent":"g2"},
            {"id":"g2b","label":"src/server.ts","change":"changed","meta":"+8 −2","parent":"g2"},
            {"id":"g2c","label":"src/config.ts","change":"changed","meta":"+26 −10","parent":"g2"},
            {"id":"g3","label":"Logging cleanup (unrelated to the feature)","meta":"+41 −70","parent":"pr"},
            {"id":"g3a","label":"src/lib/logger.ts","change":"changed","meta":"+30 −48","parent":"g3"},
            {"id":"g3b","label":"src/lib/legacy-log.ts","change":"removed","meta":"−22","parent":"g3"},
            {"id":"g4","label":"Docs","meta":"+38 −6","parent":"pr"},
            {"id":"g4a","label":"docs/api.md","change":"changed","meta":"+38 −6","parent":"g4"}
          ]
        }
      ],
      "response": {"type":"approve","of":"groups","depth":1}
    },
    "sample": {"picks":{"g1":"ok","g2":"ok","g3":"no","g4":"ok"},"note":"move the logging cleanup to its own PR"}
  },
  {
    "slug": "backlog-prioritisation",
    "group": "Priorizar",
    "title": "Priorização de backlog ou dívida técnica",
    "situation": "O agente auditou o repositório e encontrou nove itens de dívida técnica. Há tempo para três ou quatro neste ciclo.",
    "why": "Impacto contra esforço é uma leitura espacial: o quadrante \"alto impacto, baixo esforço\" salta aos olhos.",
    "shows": "Os itens posicionados em impacto × esforço.",
    "interaction": "Marcar os itens que entram no ciclo.",
    "sources": ["auditoria do código","histórico de incidentes"],
    "mechanisms": ["resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Tech debt for this cycle",
      "context": "Nine items from the audit. Impact is my estimate from incident history and how often the code is touched.",
      "question": "Which items go into this cycle?",
      "blocks": [
        {
          "type": "quadrant",
          "id": "debt",
          "x": {"label":"Effort","low":"low","high":"high"},
          "y": {"label":"Impact"},
          "quadrants": ["Quick wins","Big bets","Fill-ins","Avoid"],
          "items": [
            {"id":"t1","label":"Flaky auth tests","x":2,"y":8.5},
            {"id":"t2","label":"Upgrade ORM major","x":8,"y":7.5},
            {"id":"t3","label":"N+1 in orders list","x":3.2,"y":7},
            {"id":"t4","label":"Remove jQuery from admin","x":7,"y":3},
            {"id":"t5","label":"Dead feature flags","x":1.5,"y":3.2},
            {"id":"t6","label":"No retry on webhook send","x":4,"y":9},
            {"id":"t7","label":"Split OrderService","x":8.8,"y":9},
            {"id":"t8","label":"Rename legacy env vars","x":3.5,"y":1.5},
            {"id":"t9","label":"Two date libraries","x":5.5,"y":4.5}
          ]
        }
      ],
      "response": {"type":"choose_many","of":"debt"}
    },
    "sample": {"picks":{"t1":true,"t3":true,"t6":true}}
  },
  {
    "slug": "scope-cut-line",
    "group": "Priorizar",
    "title": "Linha de corte de escopo",
    "situation": "A lista de itens de uma entrega soma mais do que o prazo comporta. O agente ordena por valor e pede ao usuário que decida o que entra.",
    "why": "Cortar escopo é marcar itens olhando o custo acumulado; uma lista com custo por linha e total em tempo real resolve.",
    "shows": "Os itens ordenados por valor, com o custo de cada um e o total selecionado contra o orçamento.",
    "interaction": "Marcar e desmarcar itens; o total acompanha.",
    "sources": ["tickets do épico"],
    "mechanisms": ["resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Onboarding revamp — what fits in 15 points",
      "context": "Seven candidate items add up to 27 points. Ordered by expected effect on activation.",
      "question": "Which items make the cut?",
      "blocks": [
        {
          "type": "steps",
          "id": "items",
          "items": [
            {"id":"i1","label":"Skip email verification until first save","detail":"largest drop-off in the funnel (38%)","meta":"3 pts"},
            {"id":"i2","label":"Sample project on first login","detail":"users with a project in session 1 retain 2× better","meta":"5 pts"},
            {"id":"i3","label":"Inline hints on the editor toolbar","meta":"2 pts"},
            {"id":"i4","label":"Interactive product tour","detail":"needs a tour library and copy for 9 steps","meta":"8 pts"},
            {"id":"i5","label":"Invite teammates step","meta":"3 pts"},
            {"id":"i6","label":"Progress checklist widget","meta":"4 pts"},
            {"id":"i7","label":"Welcome email sequence","meta":"2 pts"}
          ]
        }
      ],
      "response": {"type":"choose_many","of":"items"}
    },
    "sample": {"picks":{"i1":true,"i2":true,"i3":true,"i5":true},"summary":"Selected 13 of 15 points"}
  },
  {
    "slug": "risk-assessment",
    "group": "Priorizar",
    "title": "Riscos e mitigações",
    "situation": "Antes de um lançamento, o agente levanta os riscos e propõe mitigações. O usuário decide quais tratar antes de ir para produção.",
    "why": "A matriz probabilidade × impacto é uma convenção conhecida; ligada à lista de mitigações, mostra o que cada ação tira da zona vermelha.",
    "shows": "A matriz de risco com os riscos posicionados e a lista de riscos com a mitigação proposta.",
    "interaction": "A célula e o item da lista têm o mesmo id: focar um risco destaca a célula dele na matriz.",
    "sources": ["leitura do código","plano de rollout"],
    "mechanisms": ["destaque ligado","resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Launch risks — multi-tenant release",
      "context": "Five risks I can see. Cells show where each sits before mitigation.",
      "question": "Which risks do we mitigate before launch?",
      "blocks": [
        {
          "type": "matrix",
          "columns": [{"id":"low","label":"Impact: low"},{"id":"med","label":"Impact: medium"},{"id":"high","label":"Impact: high"}],
          "rows": [
            {"id":"p-high","label":"Likelihood: high","cells":[{"v":"","heat":2},{"id":"r4","v":"R4","heat":4},{"id":"r1","v":"R1","heat":5}]},
            {"id":"p-med","label":"Likelihood: medium","cells":[{"id":"r5","v":"R5","heat":1},{"v":"","heat":2},{"id":"r2","v":"R2","heat":4}]},
            {"id":"p-low","label":"Likelihood: low","cells":[{"v":"","heat":0},{"id":"r3","v":"R3","heat":1},{"v":"","heat":2}]}
          ]
        },
        {
          "type": "steps",
          "id": "risks",
          "numbered": false,
          "items": [
            {
              "id": "r1",
              "label": "R1  Cross-tenant data leak through a missed org_id filter",
              "detail": "Mitigation: row-level security policies + a test that queries as another tenant",
              "meta": "2 days"
            },
            {
              "id": "r2",
              "label": "R2  Backfill locks `projects` during business hours",
              "detail": "Mitigation: batch in 5k rows with a pause, run at night",
              "meta": "0.5 day"
            },
            {
              "id": "r3",
              "label": "R3  Old mobile clients send no organisation header",
              "detail": "Mitigation: default to the personal organisation",
              "meta": "0.5 day"
            },
            {
              "id": "r4",
              "label": "R4  Invite emails land in spam",
              "detail": "Mitigation: send from the verified domain, add DKIM for the new sender",
              "meta": "1 day"
            },
            {
              "id": "r5",
              "label": "R5  Billing page shows per-user totals for a week",
              "detail": "Mitigation: banner explaining the transition",
              "meta": "0.5 day"
            }
          ]
        }
      ],
      "response": {"type":"choose_many","of":"risks"}
    },
    "sample": {"hover":"r1","picks":{"r1":true,"r2":true,"r4":true}}
  },
  {
    "slug": "bug-hypotheses",
    "group": "Diagnosticar",
    "title": "Hipóteses de um bug",
    "situation": "Um erro intermitente em produção. O agente tem quatro hipóteses, cada uma com evidências a favor e contra e um custo para testar.",
    "why": "Diagnóstico é uma árvore: sintoma, hipóteses, evidências. Ver a árvore inteira evita que o agente siga a primeira ideia sem o usuário perceber as outras.",
    "shows": "A árvore sintoma → hipóteses → evidências, com a probabilidade estimada e o custo do teste de cada hipótese.",
    "interaction": "Escolher qual hipótese investigar primeiro.",
    "sources": ["logs (MCP do ELK)","métricas (MCP do Grafana)","leitura do código"],
    "mechanisms": ["marcadores `status`","perguntar sobre isto"],
    "tool": "present_decision",
    "args": {
      "title": "Intermittent 502 on /api/reports",
      "context": "37 occurrences in 7 days, all between 02:00 and 02:20 UTC. No deploys in those windows.",
      "question": "Which hypothesis should I test first?",
      "blocks": [
        {
          "type": "tree",
          "id": "hyp",
          "nodes": [
            {"id":"sym","label":"502 from the load balancer, 02:00–02:20 UTC"},
            {"id":"h1","label":"Pod restarts during node autoscaling","meta":"unlikely · 10 min to test","parent":"sym"},
            {"id":"h1a","label":"No scale events in the window on 5 of 7 days","status":"failed","parent":"h1"},
            {"id":"h2","label":"Connection pool exhausted by the export job","meta":"likely · 20 min to test","parent":"sym"},
            {"id":"h2a","label":"Nightly CRM export starts at 02:00","status":"ok","parent":"h2"},
            {"id":"h2b","label":"pg pool max is 10; export opens 8 connections","status":"ok","parent":"h2"},
            {"id":"h2c","label":"\"timeout acquiring connection\" appears 31 times","status":"ok","parent":"h2"},
            {"id":"h3","label":"Slow query after statistics go stale","meta":"possible · 1 h to test","parent":"sym"},
            {"id":"h3a","label":"Autovacuum on `reports` runs at 01:50","status":"warn","parent":"h3"},
            {"id":"h4","label":"Upstream timeout shorter than the app timeout","meta":"possible · 5 min to test","parent":"sym"},
            {"id":"h4a","label":"ALB idle timeout 60 s, app timeout 90 s","status":"warn","parent":"h4"}
          ]
        }
      ],
      "response": {"type":"choose_one","of":"hyp","depth":1}
    },
    "sample": {"pick":"h2"}
  },
  {
    "slug": "incident-timeline",
    "group": "Diagnosticar",
    "title": "Linha do tempo de um incidente",
    "situation": "Depois de um incidente, o agente correlaciona logs, deploys e alertas de vários serviços para reconstruir o que aconteceu.",
    "why": "Causalidade num incidente é ordem no tempo entre serviços. Raias por serviço na mesma escala mostram o que veio antes de quê.",
    "shows": "Uma raia por serviço com os períodos degradados e os eventos (deploy, alerta, rollback), narrados passo a passo.",
    "interaction": "Avançar os passos da narrativa destaca os trechos relevantes; clicar num evento pergunta sobre ele.",
    "sources": ["logs (MCP do ELK)","alertas (MCP do Grafana)","histórico de deploys"],
    "mechanisms": ["passo a passo","marcadores `status`","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Incident 2026-11-12 — checkout errors",
      "context": "Reconstructed from 4 services' logs, the deploy history and Grafana alerts. Times in UTC.",
      "blocks": [
        {
          "type": "timeline",
          "unit": "UTC",
          "end": 60,
          "ticks": [
            {"at":0,"label":"14:00"},
            {"at":10,"label":"14:10"},
            {"at":20,"label":"14:20"},
            {"at":30,"label":"14:30"},
            {"at":40,"label":"14:40"},
            {"at":50,"label":"14:50"},
            {"at":60,"label":"15:00"}
          ],
          "tracks": [
            {
              "id": "payments",
              "label": "payments",
              "phases": [
                {"id":"p-ok","label":"healthy","start":0,"duration":12,"status":"ok"},
                {"id":"p-slow","label":"p99 4s","start":12,"duration":29,"status":"warn"},
                {"id":"p-ok2","label":"healthy","start":41,"duration":19,"status":"ok"}
              ]
            },
            {
              "id": "checkout",
              "label": "checkout-api",
              "phases": [
                {"id":"c-ok","label":"healthy","start":0,"duration":18,"status":"ok"},
                {"id":"c-err","label":"5xx 22%","start":18,"duration":24,"status":"failed"},
                {"id":"c-ok2","label":"healthy","start":42,"duration":18,"status":"ok"}
              ]
            },
            {
              "id": "db",
              "label": "postgres",
              "phases": [
                {"id":"d-ok","label":"healthy","start":0,"duration":12,"status":"ok"},
                {"id":"d-conn","label":"connections 98%","start":12,"duration":29,"status":"warn"},
                {"id":"d-ok2","label":"healthy","start":41,"duration":19,"status":"ok"}
              ]
            },
            {"id":"web","label":"web","phases":[{"id":"w-ok","label":"healthy","start":0,"duration":60,"status":"ok"}]}
          ],
          "events": [
            {"id":"e-deploy","at":11,"track":"payments","label":"deploy v3.41"},
            {"id":"e-alert","at":21,"track":"checkout","label":"alert fired","status":"failed"},
            {"id":"e-rollback","at":40,"track":"payments","label":"rollback"}
          ]
        }
      ],
      "walkthrough": [
        {
          "text": "14:11 — payments v3.41 is deployed. It adds a retry loop that opens a new DB connection per attempt.",
          "focus": ["e-deploy","p-ok","d-ok"]
        },
        {
          "text": "14:12 — payments latency climbs and Postgres connections hit 98%. Nothing alerts yet; checkout still looks healthy.",
          "focus": ["p-slow","d-conn"]
        },
        {"text":"14:18 — checkout starts timing out on payment calls; the alert fires three minutes later.","focus":["c-err","e-alert"]},
        {"text":"14:40 — rollback of payments; both services recover within two minutes.","focus":["e-rollback","p-ok2","c-ok2","d-ok2"]}
      ]
    },
    "sample": {"step":1}
  },
  {
    "slug": "log-error-heatmap",
    "group": "Diagnosticar",
    "title": "Padrão de erros nos logs",
    "situation": "O usuário pede \"dá uma olhada nos erros de hoje\". O agente consulta os logs e encontra um agrupamento que não aparece lendo linha a linha.",
    "why": "Um mapa de calor serviço × tempo revela concentração e propagação; a lista de evidências ancora a leitura em linhas de log reais.",
    "shows": "O mapa de calor de erros por serviço e janela de tempo, e as evidências que sustentam a conclusão do agente.",
    "interaction": "Cada evidência tem o id do serviço de que fala: focar uma destaca a linha do serviço; clicar numa célula pergunta sobre aquele intervalo.",
    "sources": ["logs (MCP do ELK)"],
    "mechanisms": ["destaque ligado","perguntar sobre isto"],
    "needs": ["filtro por tempo (para volumes maiores)"],
    "tool": "present_view",
    "args": {
      "title": "Errors today, by service and hour",
      "context": "ERROR-level log lines, 08:00–16:00 UTC. The 11:00–13:00 cluster starts in `search` and spreads to its callers.",
      "blocks": [
        {
          "type": "matrix",
          "columns": [
            {"id":"h08","label":"08:00"},
            {"id":"h09","label":"09:00"},
            {"id":"h10","label":"10:00"},
            {"id":"h11","label":"11:00"},
            {"id":"h12","label":"12:00"},
            {"id":"h13","label":"13:00"},
            {"id":"h14","label":"14:00"},
            {"id":"h15","label":"15:00"}
          ],
          "rows": [
            {
              "id": "search",
              "label": "search",
              "cells": [
                {"v":"3","heat":0},
                {"v":"2","heat":0},
                {"v":"9","heat":1},
                {"v":"412","heat":5},
                {"v":"388","heat":5},
                {"v":"41","heat":2},
                {"v":"4","heat":0},
                {"v":"2","heat":0}
              ]
            },
            {
              "id": "catalog",
              "label": "catalog-api",
              "cells": [
                {"v":"1","heat":0},
                {"v":"0","heat":0},
                {"v":"2","heat":0},
                {"v":"96","heat":3},
                {"v":"154","heat":4},
                {"v":"12","heat":1},
                {"v":"1","heat":0},
                {"v":"0","heat":0}
              ]
            },
            {
              "id": "web",
              "label": "web",
              "cells": [
                {"v":"5","heat":0},
                {"v":"7","heat":0},
                {"v":"6","heat":0},
                {"v":"31","heat":2},
                {"v":"77","heat":3},
                {"v":"9","heat":1},
                {"v":"6","heat":0},
                {"v":"5","heat":0}
              ]
            },
            {
              "id": "orders",
              "label": "orders",
              "cells": [
                {"v":"2","heat":0},
                {"v":"1","heat":0},
                {"v":"3","heat":0},
                {"v":"2","heat":0},
                {"v":"4","heat":0},
                {"v":"2","heat":0},
                {"v":"1","heat":0},
                {"v":"3","heat":0}
              ]
            }
          ]
        },
        {
          "type": "steps",
          "label": "Evidence",
          "items": [
            {
              "id": "search",
              "label": "search: circuit breaker opens on Elasticsearch at 10:58",
              "detail": "10:58:14 ERROR es-client CircuitBreakingException: [parent] Data too large"
            },
            {
              "id": "catalog",
              "label": "catalog-api: timeouts calling search, no fallback",
              "detail": "11:02:40 ERROR catalog SearchClient timeout after 3000ms GET /search?q=…"
            },
            {
              "id": "web",
              "label": "web: category pages fail server-side rendering",
              "detail": "11:03:05 ERROR ssr CategoryPage upstream 504 from catalog-api"
            }
          ],
          "mono": true
        }
      ]
    },
    "sample": {"hover":"catalog"}
  }
];
