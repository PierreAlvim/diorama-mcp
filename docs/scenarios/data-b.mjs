// Scenario catalogue. Prose in pt-BR (discovery), payloads in English.
// `args` is the tool call; `sample` is the example state used by wireframes and e2e tests (never sent by the agent).
export default [
  {
    "slug": "performance-before-after",
    "group": "Diagnosticar",
    "title": "Medições antes e depois",
    "situation": "O agente implementou um cache e mediu o resultado. O ganho existe, mas custa memória e complexidade de invalidação.",
    "why": "Comparar números lado a lado em barras é mais rápido e mais honesto do que uma frase como \"melhorou bastante\".",
    "shows": "Latências medidas antes e depois, e uma tabela com o que a mudança custa.",
    "interaction": "Aprovar ou rejeitar a mudança como um todo.",
    "sources": ["benchmark local (k6)","métricas (MCP do Grafana)"],
    "mechanisms": ["resposta `approve`"],
    "tool": "present_decision",
    "args": {
      "title": "Caching the product listing",
      "context": "k6, 200 virtual users for 5 minutes against staging, same dataset, three runs each (median shown).",
      "question": "Is the gain worth the added cache layer?",
      "blocks": [
        {
          "type": "chart",
          "kind": "bar",
          "unit": "ms",
          "categories": ["p50","p95","p99"],
          "series": [{"id":"before","label":"Before","values":[180,640,1450]},{"id":"after","label":"After (Redis cache)","values":[22,95,610]}]
        },
        {
          "type": "matrix",
          "label": "What it costs",
          "columns": [{"id":"before","label":"Before"},{"id":"after","label":"After"}],
          "rows": [
            {"id":"c1","label":"DB queries per request","cells":["7",{"v":"0.4 (avg)","change":"changed"}]},
            {"id":"c2","label":"Redis memory","cells":["—",{"v":"+310 MB","change":"added"}]},
            {"id":"c3","label":"Staleness after a price change","cells":["none",{"v":"up to 60 s","change":"changed"}]},
            {"id":"c4","label":"Invalidation points to maintain","cells":["0",{"v":"4","change":"added"}]}
          ]
        }
      ],
      "response": {"type":"approve"}
    },
    "sample": {}
  },
  {
    "slug": "business-rules",
    "group": "Especificar",
    "title": "Regras de negócio e permissões",
    "situation": "O agente vai implementar permissões por papel. A especificação cobre a maioria dos casos, mas deixa combinações em aberto.",
    "why": "Uma tabela de decisão expõe as lacunas: cada célula vazia é uma pergunta que o texto da especificação escondia.",
    "shows": "A matriz papel × ação com o que a especificação define e as células em aberto, e a lista das combinações que precisam de resposta.",
    "interaction": "Marcar quais combinações em aberto devem ser permitidas; a célula e o item têm o mesmo id e se destacam juntos.",
    "sources": ["especificação / ticket","leitura do código"],
    "mechanisms": ["destaque ligado","resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Project permissions by role",
      "context": "From PROJ-901. Four combinations are not covered by the spec; anything left unmarked will be denied.",
      "question": "Which of the open combinations should be allowed?",
      "blocks": [
        {
          "type": "matrix",
          "columns": [
            {"id":"view","label":"View"},
            {"id":"edit","label":"Edit"},
            {"id":"invite","label":"Invite"},
            {"id":"export","label":"Export"},
            {"id":"delete","label":"Delete"},
            {"id":"billing","label":"Billing"}
          ],
          "rows": [
            {
              "id": "owner",
              "label": "Owner",
              "cells": [
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"}
              ]
            },
            {
              "id": "admin",
              "label": "Admin",
              "cells": [
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"id":"q1","v":"?","status":"warn"},
                {"v":"deny","status":"failed"}
              ]
            },
            {
              "id": "member",
              "label": "Member",
              "cells": [
                {"v":"allow","status":"ok"},
                {"v":"allow","status":"ok"},
                {"id":"q2","v":"?","status":"warn"},
                {"id":"q3","v":"?","status":"warn"},
                {"v":"deny","status":"failed"},
                {"v":"deny","status":"failed"}
              ]
            },
            {
              "id": "guest",
              "label": "Guest",
              "cells": [
                {"v":"allow","status":"ok"},
                {"v":"deny","status":"failed"},
                {"v":"deny","status":"failed"},
                {"id":"q4","v":"?","status":"warn"},
                {"v":"deny","status":"failed"},
                {"v":"deny","status":"failed"}
              ]
            }
          ]
        },
        {
          "type": "steps",
          "id": "open",
          "label": "Open combinations",
          "numbered": false,
          "items": [
            {"id":"q1","label":"Admin can delete a project","detail":"today only owners can; support gets ~3 requests a week for this"},
            {"id":"q2","label":"Member can invite people","detail":"invites consume paid seats"},
            {"id":"q3","label":"Member can export data"},
            {"id":"q4","label":"Guest can export data","detail":"guests are usually external clients"}
          ]
        }
      ],
      "response": {"type":"choose_many","of":"open"}
    },
    "sample": {"hover":"q1","picks":{"q1":true,"q3":true}}
  },
  {
    "slug": "test-scenarios",
    "group": "Especificar",
    "title": "Cenários de teste e cobertura",
    "situation": "Antes de escrever testes para o fluxo de reembolso, o agente mapeia os comportamentos e o que já está coberto em cada nível.",
    "why": "Cobertura por comportamento (não por linha) é uma matriz; as lacunas ficam visíveis como células vazias.",
    "shows": "Comportamentos nas linhas, níveis de teste nas colunas, com o que existe e o que falta.",
    "interaction": "Marcar quais lacunas o agente deve cobrir agora.",
    "sources": ["leitura dos testes","relatório de cobertura"],
    "mechanisms": ["marcadores `status`","resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Refund flow — test coverage",
      "context": "Behaviours I found in refunds/, against the tests that exercise them.",
      "question": "Which gaps should I cover now?",
      "blocks": [
        {
          "type": "matrix",
          "id": "behaviours",
          "columns": [{"id":"unit","label":"Unit"},{"id":"integration","label":"Integration"},{"id":"e2e","label":"E2E"}],
          "rows": [
            {"id":"b1","label":"Full refund within 30 days","cells":[{"v":"✓","status":"ok"},{"v":"✓","status":"ok"},{"v":"✓","status":"ok"}]},
            {"id":"b2","label":"Partial refund of one line item","cells":[{"v":"✓","status":"ok"},{"v":"✓","status":"ok"},{"v":"–"}]},
            {"id":"b3","label":"Refund after 30 days is rejected","cells":[{"v":"gap","status":"failed"},{"v":"gap","status":"failed"},{"v":"–"}]},
            {"id":"b4","label":"Refund when the provider times out","cells":[{"v":"–"},{"v":"gap","status":"failed"},{"v":"–"}]},
            {"id":"b5","label":"Refund restores stock","cells":[{"v":"✓","status":"ok"},{"v":"gap","status":"warn"},{"v":"–"}]},
            {"id":"b6","label":"Two refunds for the same order at once","cells":[{"v":"–"},{"v":"gap","status":"failed"},{"v":"–"}]}
          ]
        }
      ],
      "response": {"type":"choose_many","of":"behaviours"}
    },
    "sample": {"picks":{"b3":true,"b4":true,"b6":true}}
  },
  {
    "slug": "branch-divergence",
    "group": "Git",
    "title": "Divergência entre branches",
    "situation": "Uma branch de release ficou para trás e alguém pergunta o que falta nela. O agente compara as branches.",
    "why": "O histórico do Git é um grafo; em texto (`git log --graph`) ele é difícil de ler, e o que interessa (o que falta, o que conflita) não fica destacado.",
    "shows": "O grafo de commits das branches envolvidas, com lentes para os commits que faltam na release e os que tocam os mesmos arquivos.",
    "interaction": "Alternar a lente; clicar num commit pergunta sobre ele.",
    "sources": ["`git log --graph`","`git cherry`","`git diff --stat`"],
    "mechanisms": ["estados (lentes)","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "release/2.4 vs main",
      "context": "release/2.4 was cut 9 days ago. main has 6 commits since; 2 of them are fixes that the release needs.",
      "lenses": [{"id":"missing","label":"Fixes missing in release"},{"id":"overlap","label":"Touch the same files"}],
      "blocks": [
        {
          "type": "graph",
          "variant": "commits",
          "lanes": [{"id":"main","label":"main"},{"id":"rel","label":"release/2.4"},{"id":"feat","label":"feat/invoices"}],
          "nodes": [
            {"id":"c1","label":"a1f3","lane":"main","note":"base"},
            {"id":"c2","label":"b72c","lane":"main","note":"feat: filters"},
            {"id":"r1","label":"e901","lane":"rel","note":"bump 2.4.0","emphasis":"faded","when":{"overlap":{"emphasis":"highlighted"}}},
            {
              "id": "c3",
              "label": "c9d0",
              "lane": "main",
              "note": "fix: tax rounding",
              "emphasis": "faded",
              "when": {"missing":{"emphasis":"highlighted"},"overlap":{"emphasis":"highlighted"}}
            },
            {"id":"f1","label":"9a2e","lane":"feat","note":"invoice PDF"},
            {"id":"c4","label":"d44b","lane":"main","note":"chore: deps"},
            {"id":"r2","label":"f0a7","lane":"rel","note":"hotfix: login"},
            {"id":"c5","label":"17ce","lane":"main","note":"fix: csv encoding","emphasis":"faded","when":{"missing":{"emphasis":"highlighted"}}},
            {"id":"f2","label":"3bd1","lane":"feat","note":"invoice email"},
            {"id":"c6","label":"88f2","lane":"main","note":"merge feat"}
          ],
          "edges": [
            {"from":"c1","to":"c2"},
            {"from":"c2","to":"c3"},
            {"from":"c1","to":"r1"},
            {"from":"c3","to":"c4"},
            {"from":"c2","to":"f1"},
            {"from":"r1","to":"r2"},
            {"from":"c4","to":"c5"},
            {"from":"f1","to":"f2"},
            {"from":"c5","to":"c6"},
            {"from":"f2","to":"c6"}
          ]
        }
      ]
    },
    "sample": {"lens":"missing"}
  },
  {
    "slug": "merge-conflicts",
    "group": "Git",
    "title": "Resolução de conflitos de merge",
    "situation": "Um rebase parou em três conflitos. O agente entende a intenção de cada lado e propõe resoluções, mas a escolha é do usuário.",
    "why": "Marcadores de conflito mostram texto, não intenção. Um cartão por lado, com o que cada mudança queria fazer, deixa a escolha informada.",
    "shows": "Para cada conflito, cartões \"nosso\", \"deles\" e \"ambos\" com a intenção de cada lado e a recomendação do agente.",
    "interaction": "Escolher uma resolução por conflito e confirmar todas de uma vez.",
    "sources": ["`git status`","`git diff` dos dois lados","mensagens de commit"],
    "mechanisms": ["resposta `choose_one` por item"],
    "tool": "present_decision",
    "args": {
      "title": "Rebase of feat/invoices onto main",
      "context": "3 conflicts in 2 files. \"Ours\" is feat/invoices, \"theirs\" is main.",
      "question": "How should each conflict be resolved?",
      "blocks": [
        {
          "type": "cards",
          "id": "conflict-1",
          "label": "1 · src/billing/tax.ts — computeTax()",
          "items": [
            {"id":"ours","title":"Ours","summary":"Adds a `region` parameter so invoices can use per-region rates."},
            {"id":"theirs","title":"Theirs","summary":"Fixes rounding: rounds per line instead of on the total (fix c9d0)."},
            {
              "id": "both",
              "title": "Both",
              "summary": "Keep the new parameter and apply per-line rounding. The changes touch different statements.",
              "recommended": true
            }
          ]
        },
        {
          "type": "cards",
          "id": "conflict-2",
          "label": "2 · src/billing/tax.ts — imports",
          "items": [
            {"id":"ours","title":"Ours","summary":"Imports `Decimal` from decimal.js."},
            {"id":"theirs","title":"Theirs","summary":"Imports `Decimal` from the internal money package, which wraps decimal.js.","recommended":true},
            {"id":"both","title":"Both","summary":"Not applicable: the two imports declare the same name."}
          ]
        },
        {
          "type": "cards",
          "id": "conflict-3",
          "label": "3 · package.json — pdfkit version",
          "items": [
            {"id":"ours","title":"Ours","summary":"pdfkit ^0.15 — needed for the invoice PDF tables.","recommended":true},
            {"id":"theirs","title":"Theirs","summary":"pdfkit ^0.13 — bumped by the dependency bot."},
            {"id":"both","title":"Both","summary":"Not applicable: one version must win."}
          ]
        }
      ],
      "response": {"type":"choose_one","of":["conflict-1","conflict-2","conflict-3"]}
    },
    "sample": {"picks":{"conflict-1":"both","conflict-2":"theirs","conflict-3":"ours"}}
  },
  {
    "slug": "cherry-pick-plan",
    "group": "Git",
    "title": "Plano de cherry-pick ou rebase",
    "situation": "É preciso levar correções da main para a branch de release. Alguns commits dependem de outros que não deveriam ir.",
    "why": "A ordem importa e as dependências entre commits não aparecem numa lista de hashes. Uma lista de passos com alertas deixa o plano revisável.",
    "shows": "Os commits na ordem em que seriam aplicados, com o que cada um faz e os alertas de dependência ou conflito.",
    "interaction": "Aprovar ou rejeitar cada commit.",
    "sources": ["`git log main ^release/2.4`","`git cherry-pick --no-commit` (ensaio)"],
    "mechanisms": ["marcadores `status`","resposta `approve` por item"],
    "tool": "present_decision",
    "args": {
      "title": "Backport to release/2.4",
      "context": "Dry run of each pick on a scratch branch. One applies with a conflict; one depends on a commit you may not want.",
      "question": "Which commits should I cherry-pick?",
      "blocks": [
        {
          "type": "steps",
          "id": "picks",
          "items": [
            {"id":"k1","label":"fix: tax rounding per line","detail":"c9d0 · src/billing/tax.ts · applies cleanly","status":"ok","meta":"+14 −6"},
            {"id":"k2","label":"fix: csv export encoding","detail":"17ce · src/export/csv.ts · applies cleanly","status":"ok","meta":"+5 −2"},
            {
              "id": "k3",
              "label": "feat: filters on the orders list",
              "detail": "b72c · required by 4e1a below · adds a feature to a patch release",
              "status": "warn",
              "meta": "+212 −40"
            },
            {
              "id": "k4",
              "label": "fix: empty state when filters return nothing",
              "detail": "4e1a · conflicts in OrdersList.tsx unless b72c is picked",
              "status": "failed",
              "meta": "+18 −3"
            }
          ],
          "mono": true
        }
      ],
      "response": {"type":"approve","of":"picks"}
    },
    "sample": {"picks":{"k1":"ok","k2":"ok","k3":"no","k4":"ok"},"note":"pick 4e1a and resolve the conflict by hand, without the filters feature"}
  },
  {
    "slug": "pipeline-run",
    "group": "CI/CD",
    "title": "Execução de uma pipeline",
    "situation": "A pipeline falhou e o usuário pergunta o que houve. O agente lê a execução e os logs do job que quebrou.",
    "why": "A pipeline já é um grafo; mostrar onde parou, o que nem chegou a rodar e a causa no próprio nó evita abrir a ferramenta de CI.",
    "shows": "Os jobs como grafo com o status de cada um e a causa da falha em destaque.",
    "interaction": "Clicar num job pergunta sobre ele (por exemplo, pedir o trecho do log).",
    "sources": ["MCP do GitHub Actions / GitLab CI","logs do job"],
    "mechanisms": ["marcadores `status`","passo a passo","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Pipeline #9142 on main — failed",
      "context": "Triggered by merge of PR #482. Failed after 6m 12s in integration tests; deploy jobs were skipped.",
      "blocks": [
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"lint","label":"lint","status":"ok"},
            {"id":"types","label":"typecheck","status":"ok"},
            {"id":"unit","label":"unit tests","status":"ok"},
            {"id":"build","label":"build image","status":"ok"},
            {"id":"integ","label":"integration tests","status":"failed"},
            {"id":"e2e","label":"e2e","status":"running"},
            {"id":"stg","label":"deploy staging","status":"pending"},
            {"id":"smoke","label":"smoke","status":"pending"},
            {"id":"prod","label":"deploy prod","status":"pending"}
          ],
          "edges": [
            {"from":"lint","to":"build"},
            {"from":"types","to":"build"},
            {"from":"unit","to":"build"},
            {"from":"build","to":"integ"},
            {"from":"build","to":"e2e"},
            {"from":"integ","to":"stg"},
            {"from":"e2e","to":"stg"},
            {"from":"stg","to":"smoke"},
            {"from":"smoke","to":"prod"}
          ]
        }
      ],
      "walkthrough": [
        {
          "text": "integration tests: 2 of 148 failed, both in rate-limit.int.test.ts — \"ECONNREFUSED 127.0.0.1:6379\". The job has no Redis service container.",
          "focus": ["integ"]
        },
        {
          "text": "The new middleware needs Redis, and ci.yml only starts Postgres for this job. Adding a redis service to the job should fix it.",
          "focus": ["integ","build"]
        }
      ]
    },
    "sample": {"step":0}
  },
  {
    "slug": "versions-per-environment",
    "group": "CI/CD",
    "title": "Versões por ambiente",
    "situation": "Antes de promover para produção, o usuário quer saber o que está rodando em cada ambiente e o que está defasado.",
    "why": "Serviço × ambiente é uma matriz; a defasagem aparece como células marcadas em vez de exigir comparar listas.",
    "shows": "Uma matriz de serviços por ambiente com a versão em cada um, marcando onde produção está atrás e onde um deploy falhou.",
    "interaction": "Clicar numa célula pergunta o que mudou entre as versões.",
    "sources": ["MCP do Kubernetes / Argo CD","registro de imagens"],
    "mechanisms": ["marcadores `status` e `change`","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "What is running where",
      "context": "Image tags from the three clusters, 2026-11-15 10:40 UTC. Amber: production is behind staging.",
      "blocks": [
        {
          "type": "matrix",
          "columns": [{"id":"dev","label":"dev"},{"id":"staging","label":"staging"},{"id":"prod","label":"production"},{"id":"behind","label":"prod behind by"}],
          "rows": [
            {"id":"web","label":"web","cells":["5.12.0","5.12.0","5.12.0","—"]},
            {"id":"api","label":"api","cells":["3.42.1","3.42.0",{"v":"3.40.2","change":"changed"},"2 releases · 9 days"]},
            {
              "id": "payments",
              "label": "payments",
              "cells": ["3.42.0",{"v":"3.42.0","status":"failed"},{"v":"3.40.0","change":"changed"},"failed in staging"]
            },
            {"id":"search","label":"search","cells":["2.8.0","2.8.0","2.8.0","—"]},
            {"id":"worker","label":"worker","cells":["3.42.1","3.42.0",{"v":"3.41.0","change":"changed"},"1 release · 4 days"]}
          ]
        }
      ]
    },
    "sample": {}
  },
  {
    "slug": "flaky-tests",
    "group": "CI/CD",
    "title": "Testes instáveis",
    "situation": "A pipeline falha de vez em quando sem mudança de código. O agente analisa as últimas execuções para separar teste instável de bug real.",
    "why": "Instabilidade é um padrão ao longo de execuções; uma grade teste × execução mostra de imediato quem falha sempre e quem falha às vezes.",
    "shows": "Os testes que falharam ao menos uma vez nas últimas dez execuções, com o resultado em cada uma e o diagnóstico do agente.",
    "interaction": "Marcar quais testes colocar em quarentena.",
    "sources": ["MCP do CI","relatórios JUnit"],
    "mechanisms": ["marcadores `status`","resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Flaky tests on main, last 10 runs",
      "context": "Same commit range re-run included. A test that always fails is a real failure, not flakiness.",
      "question": "Which tests should I quarantine while we fix them?",
      "blocks": [
        {
          "type": "matrix",
          "id": "tests",
          "columns": [
            {"id":"#9133","label":"33"},
            {"id":"#9134","label":"34"},
            {"id":"#9135","label":"35"},
            {"id":"#9136","label":"36"},
            {"id":"#9137","label":"37"},
            {"id":"#9138","label":"38"},
            {"id":"#9139","label":"39"},
            {"id":"#9140","label":"40"},
            {"id":"#9141","label":"41"},
            {"id":"#9142","label":"42"},
            {"id":"verdict","label":"result"}
          ],
          "rows": [
            {
              "id": "ft1",
              "label": "auth › refresh token rotation",
              "cells": [
                {"v":"✓","status":"ok"},
                {"v":"✗","status":"failed"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✗","status":"failed"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✗","status":"failed"},
                {"v":"✓","status":"ok"},
                "flaky"
              ]
            },
            {
              "id": "ft2",
              "label": "rate-limit › burst is rejected",
              "cells": [
                {"v":"–"},
                {"v":"–"},
                {"v":"–"},
                {"v":"–"},
                {"v":"–"},
                {"v":"–"},
                {"v":"–"},
                {"v":"–"},
                {"v":"✗","status":"failed"},
                {"v":"✗","status":"failed"},
                {"v":"real","status":"failed"}
              ]
            },
            {
              "id": "ft3",
              "label": "export › large csv streams",
              "cells": [
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✗","status":"failed"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✗","status":"failed"},
                {"v":"✓","status":"ok"},
                "flaky"
              ]
            },
            {
              "id": "ft4",
              "label": "orders › list pagination",
              "cells": [
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✗","status":"failed"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                {"v":"✓","status":"ok"},
                "once"
              ]
            }
          ]
        }
      ],
      "response": {"type":"choose_many","of":"tests"}
    },
    "sample": {"picks":{"ft1":true,"ft3":true}}
  },
  {
    "slug": "epic-breakdown",
    "group": "Ágil",
    "title": "Quebra de épico em histórias e tarefas",
    "situation": "O usuário pede ao agente que quebre um épico em histórias e crie os tickets. Antes de criar qualquer coisa, o agente mostra a proposta.",
    "why": "A quebra é hierárquica e o usuário quer vetar partes antes que virem tickets. Uma árvore com aprovação por história evita limpar o Jira depois.",
    "shows": "A árvore épico → histórias → tarefas, com a estimativa de cada história.",
    "interaction": "Aprovar ou rejeitar cada história; só as aprovadas são criadas.",
    "sources": ["descrição do épico","MCP do Jira / Linear"],
    "mechanisms": ["resposta `approve` por item"],
    "tool": "present_decision",
    "args": {
      "title": "Epic: Organisations",
      "context": "Proposed breakdown. Nothing is created in Jira until you submit.",
      "question": "Which stories should I create?",
      "blocks": [
        {
          "type": "tree",
          "id": "stories",
          "nodes": [
            {"id":"epic","label":"Organisations","meta":"31 pts"},
            {"id":"us1","label":"As an owner I can create an organisation","meta":"5 pts","parent":"epic"},
            {"id":"us1a","label":"Schema: organisations, memberships","parent":"us1"},
            {"id":"us1b","label":"Create-organisation form","parent":"us1"},
            {"id":"us2","label":"As an owner I can invite members by email","meta":"8 pts","parent":"epic"},
            {"id":"us2a","label":"Invite token and expiry","parent":"us2"},
            {"id":"us2b","label":"Invite email","parent":"us2"},
            {"id":"us2c","label":"Accept-invite page","parent":"us2"},
            {"id":"us3","label":"As a member I see only my organisation's projects","meta":"5 pts","parent":"epic"},
            {"id":"us3a","label":"Scope queries by org_id","parent":"us3"},
            {"id":"us3b","label":"Organisation switcher","parent":"us3"},
            {"id":"us4","label":"As an admin I can enforce SSO for my organisation","meta":"13 pts","parent":"epic"},
            {"id":"us4a","label":"SAML configuration page","parent":"us4"},
            {"id":"us4b","label":"Login redirect by email domain","parent":"us4"}
          ]
        }
      ],
      "response": {"type":"approve","of":"stories","depth":1}
    },
    "sample": {"picks":{"us1":"ok","us2":"ok","us3":"ok","us4":"no"},"note":"SSO goes to a separate epic"}
  },
  {
    "slug": "ticket-dependencies",
    "group": "Ágil",
    "title": "Dependências entre tickets",
    "situation": "No planejamento, o usuário pergunta o que bloqueia a entrega. Os links de \"bloqueia\" estão no Jira, mas ninguém os vê juntos.",
    "why": "Dependências formam um grafo e o caminho crítico é uma propriedade do grafo, impossível de ver numa lista de tickets.",
    "shows": "Os tickets como grafo de dependências com o status de cada um e uma lente para o caminho crítico.",
    "interaction": "Alternar a lente do caminho crítico; clicar num ticket pergunta sobre ele.",
    "sources": ["MCP do Jira / Linear"],
    "mechanisms": ["estados (lentes)","marcadores `status`","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "What blocks the Organisations release",
      "context": "11 tickets, links from Jira. The critical path has 5 tickets; ORG-14 is on it and nobody is assigned.",
      "lenses": [{"id":"critical","label":"Critical path"},{"id":"unassigned","label":"Unassigned"}],
      "blocks": [
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"o10","label":"ORG-10 schema","status":"ok","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"id":"o11","label":"ORG-11 backfill","status":"ok","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"id":"o12","label":"ORG-12 scope queries","status":"running","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"id":"o13","label":"ORG-13 switcher UI","status":"running"},
            {
              "id": "o14",
              "label": "ORG-14 RLS policies",
              "status": "pending",
              "emphasis": "faded",
              "when": {"critical":{"emphasis":"highlighted"},"unassigned":{"emphasis":"highlighted"}}
            },
            {"id":"o15","label":"ORG-15 invites","status":"running"},
            {"id":"o16","label":"ORG-16 invite email","status":"pending","emphasis":"faded","when":{"unassigned":{"emphasis":"highlighted"}}},
            {"id":"o17","label":"ORG-17 security review","status":"pending","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"id":"o18","label":"ORG-18 release","status":"pending","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}}
          ],
          "edges": [
            {"from":"o10","to":"o11","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"from":"o11","to":"o12","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"from":"o12","to":"o14","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"from":"o12","to":"o13"},
            {"from":"o10","to":"o15"},
            {"from":"o15","to":"o16"},
            {"from":"o14","to":"o17","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"from":"o17","to":"o18","emphasis":"faded","when":{"critical":{"emphasis":"highlighted"}}},
            {"from":"o13","to":"o18"},
            {"from":"o16","to":"o18"}
          ]
        }
      ]
    },
    "sample": {"lens":"critical"}
  },
  {
    "slug": "sprint-board",
    "group": "Ágil",
    "title": "Quadro da sprint",
    "situation": "Na daily, o usuário pede um resumo da sprint. O agente lê o quadro e destaca o que merece atenção.",
    "why": "O quadro em colunas é a forma que o time já conhece. O valor do agente está no destaque: o que está parado, o que estourou o limite.",
    "shows": "As colunas do quadro com os cartões, destacando os itens parados e a coluna acima do limite de WIP.",
    "interaction": "Alternar a lente de itens parados; clicar num cartão pergunta sobre ele.",
    "sources": ["MCP do Jira / Linear"],
    "mechanisms": ["estados (lentes)","marcadores `status`","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Sprint 47 — day 6 of 10",
      "context": "18 of 34 points done. Review is over its WIP limit and two cards have not moved in 3+ days.",
      "lenses": [{"id":"stale","label":"No movement in 3+ days"},{"id":"bugs","label":"Bugs"}],
      "blocks": [
        {
          "type": "board",
          "columns": [
            {
              "id": "todo",
              "label": "To do",
              "items": [
                {"id":"ORG-16","label":"ORG-16 Invite email","tag":"story · 3 pts"},
                {"id":"ORG-17","label":"ORG-17 Security review","tag":"task · 2 pts"}
              ]
            },
            {
              "id": "doing",
              "label": "In progress",
              "limit": 4,
              "items": [
                {"id":"ORG-12","label":"ORG-12 Scope queries","tag":"story · 5 pts"},
                {
                  "id": "ORG-15",
                  "label": "ORG-15 Invites",
                  "tag": "story · 8 pts · 4d here",
                  "status": "warn",
                  "emphasis": "faded",
                  "when": {"stale":{"emphasis":"highlighted"}}
                },
                {"id":"BUG-311","label":"BUG-311 Refund tax","tag":"bug · 1 day","emphasis":"faded","when":{"bugs":{"emphasis":"highlighted"}}}
              ]
            },
            {
              "id": "review",
              "label": "In review",
              "limit": 2,
              "items": [
                {"id":"ORG-13","label":"ORG-13 Switcher UI","tag":"story · 3 pts"},
                {
                  "id": "BUG-305",
                  "label": "BUG-305 CSV encoding",
                  "tag": "bug · 5d here",
                  "status": "warn",
                  "emphasis": "faded",
                  "when": {"stale":{"emphasis":"highlighted"},"bugs":{"emphasis":"highlighted"}}
                },
                {"id":"ORG-19","label":"ORG-19 Audit log","tag":"story · 3 pts"}
              ]
            },
            {
              "id": "done",
              "label": "Done",
              "items": [
                {"id":"ORG-10","label":"ORG-10 Schema","tag":"story · 5 pts","status":"ok"},
                {"id":"ORG-11","label":"ORG-11 Backfill","tag":"story · 5 pts","status":"ok"},
                {"id":"BUG-298","label":"BUG-298 Login loop","tag":"bug","status":"ok","emphasis":"faded","when":{"bugs":{"emphasis":"highlighted"}}}
              ]
            }
          ]
        }
      ]
    },
    "sample": {"lens":"stale"}
  },
  {
    "slug": "traceability",
    "group": "Ágil",
    "title": "Rastreabilidade história × PR × teste × deploy",
    "situation": "Antes da review da sprint, o usuário quer saber o que de fato chegou em produção e o que está \"pronto\" só no quadro.",
    "why": "A informação está espalhada em três ferramentas. Cruzada numa matriz, a pergunta \"isso está entregue?\" vira uma linha.",
    "shows": "Uma linha por história com o estado do ticket, do PR, dos testes e do deploy.",
    "interaction": "Clicar numa célula pergunta sobre aquela pendência.",
    "sources": ["MCP do Jira / Linear","MCP do GitHub","MCP do CI/CD"],
    "mechanisms": ["marcadores `status`","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Sprint 47 — what actually shipped",
      "context": "Ticket status against PRs, CI and the production deploy log.",
      "blocks": [
        {
          "type": "matrix",
          "columns": [{"id":"ticket","label":"Ticket"},{"id":"pr","label":"PR"},{"id":"tests","label":"Tests"},{"id":"prod","label":"In production"}],
          "rows": [
            {
              "id": "ORG-10",
              "label": "ORG-10 Schema",
              "cells": [{"v":"Done","status":"ok"},{"v":"#471 merged","status":"ok"},{"v":"pass","status":"ok"},{"v":"3.41.0","status":"ok"}]
            },
            {
              "id": "ORG-11",
              "label": "ORG-11 Backfill",
              "cells": [{"v":"Done","status":"ok"},{"v":"#474 merged","status":"ok"},{"v":"pass","status":"ok"},{"v":"not deployed","status":"warn"}]
            },
            {
              "id": "ORG-13",
              "label": "ORG-13 Switcher UI",
              "cells": [{"v":"In review","status":"running"},{"v":"#480 open","status":"running"},{"v":"pass","status":"ok"},{"v":"—"}]
            },
            {
              "id": "BUG-298",
              "label": "BUG-298 Login loop",
              "cells": [{"v":"Done","status":"ok"},{"v":"#469 merged","status":"ok"},{"v":"no test added","status":"warn"},{"v":"3.40.2","status":"ok"}]
            },
            {
              "id": "BUG-305",
              "label": "BUG-305 CSV encoding",
              "cells": [{"v":"In review","status":"running"},{"v":"#476 open","status":"running"},{"v":"failing","status":"failed"},{"v":"—"}]
            }
          ]
        }
      ]
    },
    "sample": {}
  },
  {
    "slug": "agent-progress",
    "group": "Além",
    "title": "Progresso do próprio agente",
    "situation": "Numa tarefa longa com subagentes, o usuário volta depois de vinte minutos e quer saber em que ponto as coisas estão.",
    "why": "O texto do chat é uma sequência de eventos; o usuário quer o estado. Uma lista de passos com status é esse estado.",
    "shows": "O plano com o status de cada passo e uma tabela do que cada subagente está fazendo.",
    "interaction": "Clicar num passo pergunta sobre ele; a view pode ser reemitida a cada marco.",
    "sources": ["estado interno do agente"],
    "mechanisms": ["marcadores `status`","perguntar sobre isto"],
    "needs": ["atualizar (novo retrato a pedido)"],
    "tool": "present_view",
    "args": {
      "title": "Organisations migration — progress",
      "context": "Started 14:02. 4 of 7 steps done, one blocked on a failing test.",
      "blocks": [
        {
          "type": "steps",
          "items": [
            {"id":"st1","label":"Create organisations and memberships tables","status":"ok","meta":"2 min"},
            {"id":"st2","label":"Backfill personal organisations","status":"ok","meta":"3 min"},
            {"id":"st3","label":"Add org_id to projects and scope the queries","status":"ok","meta":"9 min"},
            {"id":"st4","label":"Update API handlers (14 files)","status":"ok","meta":"6 min"},
            {
              "id": "st5",
              "label": "Fix tests broken by the scoping",
              "detail": "23 of 31 fixed; 8 remain in test/projects/",
              "status": "running",
              "meta": "subagent: tests"
            },
            {
              "id": "st6",
              "label": "Organisation switcher in the web app",
              "detail": "blocked: needs the /me/organisations endpoint from step 4 to pass its test",
              "status": "blocked",
              "meta": "subagent: web"
            },
            {"id":"st7","label":"Run the full suite and write the PR description","status":"pending"}
          ]
        },
        {
          "type": "matrix",
          "label": "Subagents",
          "columns": [{"id":"task","label":"Working on"},{"id":"state","label":"State"},{"id":"files","label":"Files touched"}],
          "rows": [
            {"id":"sa1","label":"tests","cells":["test/projects/*.test.ts",{"v":"running","status":"running"},"23"]},
            {"id":"sa2","label":"web","cells":["web/components/OrgSwitcher.tsx",{"v":"waiting","status":"blocked"},"4"]},
            {"id":"sa3","label":"docs","cells":["docs/api.md",{"v":"done","status":"ok"},"2"]}
          ]
        }
      ]
    },
    "sample": {}
  },
  {
    "slug": "codebase-tour",
    "group": "Além",
    "title": "Tour de codebase",
    "situation": "Alguém novo no projeto pede \"me explica como esse repositório é organizado\".",
    "why": "Uma arquitetura se entende seguindo um caminho por ela. O passo a passo sobre o grafo dá a ordem que um diagrama estático não tem.",
    "shows": "As camadas e módulos como grafo, percorridos por uma narrativa que segue uma requisição de ponta a ponta.",
    "interaction": "Avançar e voltar os passos; clicar num módulo pergunta sobre ele.",
    "sources": ["leitura do código","README e docs"],
    "mechanisms": ["passo a passo","perguntar sobre isto"],
    "needs": ["detalhe sob demanda (arquivo:linha por elemento)"],
    "tool": "present_view",
    "args": {
      "title": "How this repository is organised",
      "context": "Following one request — \"create an order\" — from the browser to the database and the background worker.",
      "blocks": [
        {
          "type": "graph",
          "direction": "LR",
          "nodes": [
            {"id":"web","label":"web/ (Next.js)"},
            {"id":"routes","label":"src/routes"},
            {"id":"mw","label":"src/middleware"},
            {"id":"services","label":"src/services"},
            {"id":"repos","label":"src/repos"},
            {"id":"db","label":"Postgres"},
            {"id":"events","label":"src/events"},
            {"id":"jobs","label":"src/jobs"},
            {"id":"lib","label":"src/lib"}
          ],
          "edges": [
            {"from":"web","to":"mw","label":"HTTP"},
            {"from":"mw","to":"routes"},
            {"from":"routes","to":"services"},
            {"from":"services","to":"repos"},
            {"from":"repos","to":"db"},
            {"from":"services","to":"events","label":"publish"},
            {"from":"events","to":"jobs"},
            {"from":"jobs","to":"repos"},
            {"from":"services","to":"lib"}
          ]
        }
      ],
      "walkthrough": [
        {"text":"The browser calls the API. Every request passes through src/middleware first: auth, rate limiting, request id.","focus":["web","mw"]},
        {"text":"src/routes only parses and validates input, then calls a service. No business logic lives here.","focus":["mw","routes","services"]},
        {
          "text": "src/services holds the business rules. Services never run SQL; they go through src/repos, the only code that talks to Postgres.",
          "focus": ["services","repos","db"]
        },
        {"text":"Anything slow is published as an event and picked up by src/jobs: emails, exports, webhooks.","focus":["services","events","jobs"]}
      ]
    },
    "sample": {"step":2}
  },
  {
    "slug": "dependency-audit",
    "group": "Além",
    "title": "Auditoria de dependências e segurança",
    "situation": "O scanner de segurança apontou vulnerabilidades. Quase todas estão em dependências transitivas, e o usuário precisa saber o que atualizar.",
    "why": "A pergunta \"de onde vem esse pacote?\" é uma pergunta de árvore. Ver o caminho até a dependência direta mostra qual atualização resolve.",
    "shows": "A árvore de dependências reduzida aos caminhos que levam a pacotes vulneráveis, com a severidade e a versão que corrige.",
    "interaction": "Marcar quais dependências diretas atualizar.",
    "sources": ["`npm audit --json`","`npm ls`","changelogs"],
    "mechanisms": ["marcadores `status` e `change`","resposta `choose_many`"],
    "tool": "present_decision",
    "args": {
      "title": "Vulnerable dependencies",
      "context": "npm audit: 1 critical, 2 high, 1 moderate. All four are transitive; three direct upgrades would clear them.",
      "question": "Which direct dependencies should I upgrade?",
      "blocks": [
        {
          "type": "tree",
          "id": "deps",
          "nodes": [
            {"id":"app","label":"shop-api@3.42.1"},
            {"id":"dep1","label":"express 4.18.2 → 4.21.1","meta":"minor · non-breaking","parent":"app"},
            {"id":"dep1a","label":"body-parser 1.20.1","status":"failed","note":"CVE-2024-45590 · high · DoS","parent":"dep1"},
            {"id":"dep1b","label":"path-to-regexp 0.1.7","status":"failed","note":"CVE-2024-45296 · high · ReDoS","parent":"dep1"},
            {"id":"dep2","label":"pdfkit 0.13.0 → 0.15.0","meta":"minor · table API changed","parent":"app"},
            {"id":"dep2a","label":"crypto-js 4.1.1","status":"failed","note":"CVE-2023-46233 · critical · weak PBKDF2","parent":"dep2"},
            {"id":"dep3","label":"jest 29.5.0 → 29.7.0","meta":"patch · dev only","parent":"app"},
            {"id":"dep3a","label":"braces 3.0.2","status":"warn","note":"CVE-2024-4068 · moderate · dev dependency","parent":"dep3"}
          ]
        }
      ],
      "response": {"type":"choose_many","of":"deps","depth":1}
    },
    "sample": {"picks":{"dep1":true,"dep3":true},"note":"pdfkit goes with the invoices branch, which already needs 0.15"}
  },
  {
    "slug": "config-drift",
    "group": "Além",
    "title": "Diferença de configuração entre ambientes",
    "situation": "Algo funciona em staging e falha em produção. O agente compara a configuração efetiva dos ambientes.",
    "why": "Diferença entre ambientes é chave × ambiente. Mostrar só as chaves divergentes, com a divergência marcada, substitui o diff de três arquivos.",
    "shows": "As chaves que diferem entre ambientes, marcando as diferenças inesperadas e a chave ausente em produção.",
    "interaction": "Clicar numa célula pergunta de onde vem aquele valor.",
    "sources": ["arquivos de configuração","MCP do Kubernetes (ConfigMaps)","gerenciador de segredos (só nomes)"],
    "mechanisms": ["marcadores `change` e `status`","passo a passo","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Configuration drift across environments",
      "context": "62 keys compared, 6 differ. Differences that are expected (URLs, replicas) are left unmarked. Secrets are compared by presence only.",
      "blocks": [
        {
          "type": "matrix",
          "columns": [{"id":"dev","label":"dev"},{"id":"staging","label":"staging"},{"id":"prod","label":"production"}],
          "rows": [
            {"id":"k1","label":"DATABASE_URL","cells":["dev-db","stg-db","prod-db"]},
            {"id":"k2","label":"REPLICAS","cells":["1","2","6"]},
            {"id":"k3","label":"RATE_LIMIT_ENABLED","cells":["true","true",{"v":"false","change":"changed"}]},
            {"id":"k4","label":"REDIS_URL","cells":["set","set",{"v":"missing","status":"failed"}]},
            {"id":"k5","label":"PG_POOL_MAX","cells":["10","10",{"v":"10","status":"warn"}]},
            {"id":"k6","label":"LOG_LEVEL","cells":[{"v":"debug","change":"changed"},"info","info"]}
          ],
          "mono": true
        }
      ],
      "walkthrough": [
        {
          "text": "REDIS_URL is not set in production, so the rate limiter cannot start — that is why the feature flag was turned off there.",
          "focus": ["k3","k4"]
        },
        {"text":"PG_POOL_MAX is 10 everywhere, but production runs 6 replicas: 60 connections against a database limit of 50.","focus":["k2","k5"]}
      ]
    },
    "sample": {"step":0}
  },
  {
    "slug": "query-plan",
    "group": "Além",
    "title": "Plano de query e perfil de performance",
    "situation": "Uma query ficou lenta. O agente roda `EXPLAIN ANALYZE` e precisa mostrar onde o tempo vai.",
    "why": "O plano de execução é uma árvore com custo por nó. A saída textual do Postgres é correta e ilegível; uma árvore com barras de tempo mostra o gargalo.",
    "shows": "A árvore do plano com o tempo de cada nó em barras e o nó problemático marcado.",
    "interaction": "Clicar num nó pergunta sobre ele (por exemplo, que índice resolveria).",
    "sources": ["`EXPLAIN (ANALYZE, BUFFERS)`","schema e índices existentes"],
    "mechanisms": ["marcadores `status`","passo a passo","perguntar sobre isto"],
    "tool": "present_view",
    "args": {
      "title": "Why the orders report takes 4.1 s",
      "context": "EXPLAIN ANALYZE of the report query on a production snapshot. Bars show time spent in each node, children included.",
      "blocks": [
        {
          "type": "tree",
          "nodes": [
            {"id":"n1","label":"Sort","note":"by created_at desc","value":4120,"valueLabel":"4120 ms","meta":"50 rows"},
            {"id":"n2","label":"HashAggregate","note":"group by customer_id","value":4090,"valueLabel":"4090 ms","meta":"8,412 rows","parent":"n1"},
            {
              "id": "n3",
              "label": "Hash Join",
              "note": "orders.customer_id = customers.id",
              "value": 3950,
              "valueLabel": "3950 ms",
              "meta": "1.9M rows",
              "parent": "n2"
            },
            {
              "id": "n4",
              "label": "Seq Scan on orders",
              "note": "filter: status = 'paid' and created_at > …",
              "value": 3610,
              "valueLabel": "3610 ms",
              "meta": "1.9M of 14M rows",
              "status": "failed",
              "parent": "n3"
            },
            {"id":"n5","label":"Hash","value":85,"valueLabel":"85 ms","meta":"41k rows","parent":"n3"},
            {
              "id": "n6",
              "label": "Index Scan on customers",
              "note": "customers_pkey",
              "value": 62,
              "valueLabel": "62 ms",
              "meta": "41k rows",
              "status": "ok",
              "parent": "n5"
            }
          ]
        }
      ],
      "walkthrough": [
        {
          "text": "88% of the time is one sequential scan: Postgres reads all 14M orders to keep 1.9M. There is no index on (status, created_at).",
          "focus": ["n4"]
        },
        {
          "text": "The join and the aggregation are cheap once the rows are in memory. A partial index on created_at where status = 'paid' should bring the scan under 300 ms.",
          "focus": ["n3","n2","n5","n6"]
        }
      ]
    },
    "sample": {"step":0}
  }
];
