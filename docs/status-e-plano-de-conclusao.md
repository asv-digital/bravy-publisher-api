# Bravy Publisher — Análise de Status e Plano de Conclusão

## Contexto

O sócio do JP iniciou o **Bravy Publisher**, um SaaS multi-tenant para gerar, renderizar, agendar e publicar carrosséis em redes sociais (Instagram, LinkedIn, TikTok, Twitter) usando IA (Claude).

O projeto está dividido em dois repositórios git independentes:

- `/Users/jpasv/www/publisher/backend/` — NestJS 10 + Prisma + Postgres + Redis/BullMQ + MinIO + Playwright + Claude API
- `/Users/jpasv/www/publisher/frontend/` — Next.js 16 (App Router) + React 19 + shadcn/ui + Tailwind 4 + React Query + Zustand

Ambos os repos têm 1–3 commits (scaffold inicial). A pergunta do JP: **o que está pronto, o que falta, e quais são os próximos passos pra concluir.**

---

## 1. Status Atual — Visão Geral

| Camada | % Pronto | Resumo |
|---|---|---|
| Backend — arquitetura e infra | 90% | NestJS modular, Docker (API + Worker + Postgres + Redis + MinIO), Prisma, BullMQ, Swagger, JWT/RBAC multi-tenant — tudo de pé. |
| Backend — domínio (CRUD + state machine) | 85% | Content, Slide, Template, SocialAccount, Schedule, Analytics todos com CRUD; state machine de status do Content implementada. |
| Backend — geração IA | 80% | Claude API com prompt caching + dataset + fact-check funciona. Falta extrair `tenantId` do JWT (hardcoded). |
| Backend — render Playwright | 85% | Renderiza HTML → PNG 1080×1080 → MinIO, atualiza Slide. Funcional. |
| Backend — publish Instagram | 75% | 4-phase Graph API (children → wait → carousel → publish). Funcional, mas waits hardcoded. |
| Backend — publish LinkedIn | 0% | Stub que `throw new Error('not yet implemented')`. |
| Backend — publish TikTok / Twitter | 0% | Não existe adapter. |
| Backend — OAuth conexão de conta | 0% | Só CRUD; token armazenado em texto plano. |
| Backend — scheduled publishing | 50% | Cron marca PENDING→PROCESSING mas **não enfileira no BullMQ** — fica órfão. |
| Backend — analytics sync | 30% | Endpoints retornam dados do banco; nenhum job puxa métricas reais do Instagram/LinkedIn. |
| Backend — testes | 5% | Só `fact-check/validate.spec.ts`. |
| Frontend — auth + layout | 95% | Login, AuthContext, guard de rotas, sidebar, dark mode — tudo pronto. |
| Frontend — listagem de Content | 95% | Tabela, paginação, filtros, bulk actions, status badge — tudo ligado em API real. |
| Frontend — wizard de criação (6 steps) | 70% | UI montada; falta ligar geração ao backend e tratar erro de IA. |
| Frontend — editor split (form + preview) | 60% | Layout pronto, auto-save 30s funciona. Render/Schedule/Publish são placeholders (botão não chama API). |
| Frontend — calendar / templates / accounts / analytics | 50% | Telas desenhadas, mas muitas com mock data; OAuth de account é dialog placeholder. |
| Frontend — testes | 0% | Zero. |

**Score global: ~62% pronto.** O esqueleto está sólido; o que falta é fechar integrações externas (OAuth + adapters de plataforma), fechar o loop frontend↔backend (publish/render/analytics) e endurecer (security, testes, observabilidade).

---

## 2. Bugs e Red Flags Críticos (corrigir ANTES de evoluir features)

| # | Severidade | Local | Problema | Fix |
|---|---|---|---|---|
| 1 | 🔴 Crítico | `backend/src/modules/generation/generation.controller.ts:11-12` | `tenantId` hardcoded `'default-tenant'` — quebra multi-tenancy | Usar `@CurrentTenant()` decorator (já existe) |
| 2 | 🔴 Crítico | `backend/src/modules/schedules/publish-cron.service.ts:28` | Cron marca PROCESSING mas não enfileira no BullMQ — agendamento órfão | Após `update(status:PROCESSING)`, chamar `this.publishQueue.add(...)` |
| 3 | 🔴 Crítico | `backend/src/modules/publishing/adapters/linkedin-client.ts:9` | `throw new Error('LinkedIn adapter not yet implemented')` | Implementar ou desabilitar LinkedIn na UI até existir |
| 4 | 🟠 Alto | `backend/prisma/schema.prisma:97` (SocialAccount.accessToken) | Token OAuth salvo em texto plano | Encriptar com `crypto` AES-256-GCM (chave em env) antes de persistir |
| 5 | 🟠 Alto | `backend/.env.example:21` | `JWT_SECRET=change-me-in-production` | Documentar geração de secret forte + checar em runtime (refuse boot se default) |
| 6 | 🟠 Alto | `backend/src/modules/generation/generation.service.ts:21` | `DATASET_DIR` aponta pra `~/codigos/marketing/posts/dataset` — só funciona na máquina do sócio | Mover dataset pra dentro do repo (`backend/datasets/`) ou pra MinIO |
| 7 | 🟠 Alto | `frontend/src/features/content/components/editor/editor-split-layout.tsx:97-107` | `handleRender`, `handleSchedule`, `handlePublish` são no-op | Conectar a mutations React Query → POST /render/:id, /publish/:id |
| 8 | 🟠 Alto | frontend editor + slide cards | `dangerouslySetInnerHTML` em conteúdo gerado por IA | Sanitizar com DOMPurify (a IA pode injetar HTML não intencional) |
| 9 | 🟡 Médio | `backend/src/main.ts:18` | `console.log` solto | Trocar por Logger do Nest |
| 10 | 🟡 Médio | backend root | `yarn.lock` + `pnpm-lock.yaml` coexistindo + `pnpm-workspace.yaml` | Escolher 1 package manager (recomendo pnpm pelo `pnpm-workspace.yaml`) e remover o outro |
| 11 | 🟡 Médio | `backend/src` — quase nenhum `.spec.ts` | Sem testes | Pelo menos smoke tests dos services críticos (auth, content state machine, generation) |
| 12 | 🟡 Médio | frontend `.env.local` | Só tem `NEXT_PUBLIC_API_URL` (hardcoded localhost) | Documentar vars de prod + mock mode |

---

## 3. Próximos Passos — Ordem Recomendada (4 sprints)

### 🏁 Sprint 1 — Tirar bloqueios e fechar o loop ponta-a-ponta (1 semana)

**Objetivo:** sair de "scaffold com mock" para "fluxo Instagram funcionando do clique no botão até o post no ar".

- Fix bugs críticos **1, 2, 6, 9, 10** da tabela acima
- Conectar editor → backend (bug 7):
  - `handleRender` → `POST /render/:id` + polling `GET /render/:id/status`
  - `handleSchedule` → abrir `SchedulingDialog` (já existe scaffold no wizard step 6) + `POST /publish/:id` com `scheduledAt`
  - `handlePublish` → `POST /publish/:id` sem `scheduledAt`
- Status polling no editor (toast "renderizando…" → "pronto" → "publicado")
- Sanitizar HTML no front (bug 8) — DOMPurify wrap em todos os `dangerouslySetInnerHTML`
- Smoke test end-to-end manual: registrar → criar content via wizard → editar → render → publicar no IG sandbox

**Entrega:** vídeo de 1 carrossel sendo gerado, renderizado e publicado no Instagram via app rodando localmente.

### 🔐 Sprint 2 — OAuth real + segurança (1 semana)

**Objetivo:** parar de pedir pro usuário colar accessToken na mão e endurecer a infra.

- Implementar OAuth Instagram (Meta Business Login flow):
  - `GET /oauth/instagram/start` → redireciona pro Facebook
  - `GET /oauth/instagram/callback` → troca code por long-lived token, salva criptografado
  - `frontend/src/features/accounts/components/account-connect-dialog.tsx` → fazer redirect real
- Encriptar `SocialAccount.accessToken` (bug 4): AES-256-GCM, chave em `ENCRYPTION_KEY` env, helper `EncryptionService` no backend
- Validar `JWT_SECRET` em runtime (bug 5): boot falha se for `change-me-in-production`
- Refresh automático de token IG (long-lived expira em 60 dias) — cron mensal renovando
- Rate limiting global (`@nestjs/throttler` já no package.json, mas não configurado)
- Helmet + CORS restritivo em produção

**Entrega:** usuário conecta IG via 1 clique (OAuth), sem ver token.

### 📊 Sprint 3 — Analytics real + agendamento confiável (1 semana)

**Objetivo:** dashboard parar de mostrar números mockados.

- Job de sync de Insights (BullMQ recurring job a cada 6h):
  - Pra cada `PublishTarget COMPLETED` dos últimos 90 dias, chamar Instagram Insights API
  - Popular tabela `Analytics` (likes, comments, shares, saves, reach, impressions, engagementRate)
- Frontend Analytics: trocar mocks por React Query hits em `/analytics/dashboard|ranking|comparison`
- Calendar real (`frontend/src/features/calendar`): fetch de `PublishTarget` com `scheduledAt`
- Bulk publish/schedule na tabela de Content (já tem UI de bulk actions, falta mutation)
- Notificações (toast + opcional email): publish OK / publish FAIL com retry button

**Entrega:** dashboard mostra dados reais dos últimos 90d; calendário mostra agendamentos reais; falha de publish é visível.

### 🌐 Sprint 4 — Multi-plataforma + polimento (1 semana)

**Objetivo:** parar de ser "só Instagram".

- LinkedIn adapter (bug 3) — LinkedIn API v2 (`ugcPosts` endpoint com carrossel via document share)
- Twitter/X adapter (API v2 media/upload + tweets) — opcional, validar com JP se é prioridade
- TikTok adapter — Content Posting API (foto carousel) — opcional
- Webhook de status das plataformas (IG webhook pra saber se post foi deletado/erro)
- Testes: pelo menos `auth.service.spec.ts`, `content-status.machine.spec.ts`, `instagram-client.spec.ts` com mock de fetch
- Observabilidade: Sentry no front e back, structured logging (pino) com requestId
- CI/CD: GitHub Actions com lint + typecheck + test + prisma validate + build

**Entrega:** LinkedIn publicando em produção; testes verdes no CI; erros indo pro Sentry.

---

## 4. Arquivos Críticos pra Tocar (referência)

### Backend

- `backend/prisma/schema.prisma` — 11 models, schema sólido (talvez adicionar tabela `Schedule` separada se quiser desacoplar de `PublishTarget`)
- `backend/src/modules/generation/generation.controller.ts` — fix `tenantId`
- `backend/src/modules/schedules/publish-cron.service.ts` — fix enqueue gap
- `backend/src/modules/publishing/adapters/linkedin-client.ts` — implementar
- `backend/src/modules/publishing/adapters/instagram-client.ts` — tornar waits configuráveis
- `backend/src/modules/social-accounts/` — adicionar OAuth controllers + `EncryptionService`
- `backend/docker-compose.yml` — adicionar volumes nomeados pra MinIO se ainda não estiver

### Frontend

- `frontend/src/features/content/components/editor/editor-split-layout.tsx` — conectar render/schedule/publish
- `frontend/src/features/content/components/editor/` — sanitizar HTML
- `frontend/src/features/accounts/components/account-connect-dialog.tsx` — OAuth redirect real
- `frontend/src/features/analytics/api/analytics-api.ts` — remover mocks
- `frontend/src/mock/handlers.ts` — manter só pra dev offline

---

## 5. Verificação (como validar que cada sprint encerrou)

**Sprint 1:**

- `docker compose up` no backend; `pnpm dev` no front; criar conta; rodar wizard; ver carrossel real publicado no IG (conta teste).
- Confirmar que `publish_targets` com `scheduledAt` futuro são pegos pelo cron e enfileirados (logs do worker).

**Sprint 2:**

- Tentar bootar API com `JWT_SECRET=change-me-in-production` → deve falhar.
- Conectar IG via OAuth (1 clique) e ver token criptografado no Postgres (`select access_token from social_accounts` → blob hex, não JSON).

**Sprint 3:**

- Job recurring rodando — BullMQ dashboard mostra job `insights-sync` executando a cada 6h.
- Dashboard com números diferentes a cada refresh manual de Insights.

**Sprint 4:**

- Publicar carrossel no LinkedIn via app.
- GitHub Actions verde no PR.
- Sentry recebendo test error manual.

---

## 6. Decisões Pendentes (perguntar ao JP)

1. **LinkedIn vs Twitter vs TikTok** — prioridade pós-Instagram?
2. **Onde fica o `dataset/`** (atualmente em `~/codigos/marketing/posts/dataset` do sócio) — commitar no repo ou mover pro MinIO?
3. **Package manager** — npm, yarn ou pnpm? (recomendo pnpm pelo workspace).
4. **Plano de billing/pricing** — vai cobrar dos usuários? Se sim, integrar Stripe entra em qual sprint?
5. **Migrations** — rodar com `migrate deploy` em prod ou `db push`? (`Dockerfile.api` já usa `migrate deploy`, bom).
6. **Onde hospedar** — Coolify (como Hoppe/members)? Vercel pro front? Railway/Render pro backend+worker+postgres+redis+minio?

---

## 7. Notas Operacionais — OAuth Instagram

### 7.1 Multi-tenant: 1 app Meta atende todos os tenants

Esse é o modelo de qualquer SaaS multi-tenant que publica em rede social (Buffer, Hootsuite, Later, Metricool — todos usam **um** app Meta pra milhares de clientes). Modelo mental correto:

- **App Meta** = identidade pública do **Bravy Publisher** perante a Meta. `App ID`/`App Secret` são credenciais do produto, **não** dos usuários.
- **Token OAuth resultante** = credencial de **um usuário específico** autorizando o app a publicar **na conta IG dele**.
- **Multi-tenancy** acontece **no banco do Bravy**, não na Meta. O `SocialAccount.tenantId` separa qual token pertence a qual cliente.

Fluxo concreto:

```
Tenant A (loja-x) faz OAuth → token_a → SocialAccount{tenantId: A, accessToken: encrypt(token_a)}
Tenant B (loja-y) faz OAuth → token_b → SocialAccount{tenantId: B, accessToken: encrypt(token_b)}

Publicação:
- Tenant A → busca SocialAccount onde tenantId=A → decripta token_a → posta no IG da loja-x
- Tenant B → busca SocialAccount onde tenantId=B → decripta token_b → posta no IG da loja-y
```

Implementado em [publishing.service.ts:38-61](../src/modules/publishing/publishing.service.ts#L38-L61) — cada tenant tem o token isolado por `socialAccount.id`.

`META_APP_ID`/`META_APP_SECRET` ficam fixos na infra (env do servidor), **não** por tenant.

#### Quando UM app **não** basta (edge cases — não aplicáveis ao Bravy hoje)

1. **White-label profundo** — cliente quer que o popup OAuth diga "Loja X solicita acesso", não "Bravy Publisher solicita acesso". Aí cada cliente cria o próprio app Meta. Caríssimo de operar.
2. **Limites de rate por app Meta** — só vira gargalo com dezenas de milhares de tenants publicando simultaneamente.

### 7.2 Development mode vs Live mode

Pra QUALQUER tenant (que não seja você) conseguir fazer OAuth, o app precisa estar em **Live mode**, o que exige **App Review da Meta**.

- **Development mode** (default ao criar o app): só usuários adicionados em **Roles → Roles** como Admin/Developer/Tester conseguem logar. Liberado em 30s — basta te adicionar como Tester.
- **Live mode**: qualquer cliente seu pode logar. Exige App Review da Meta — formulário + screencast mostrando o fluxo + justificativa de cada scope. Costuma levar **5–15 dias**. Approve uma vez, vale pra sempre.

**Estratégia recomendada:** ficar em Development mode pra validar o flow com seu user de teste; só abrir App Review quando o produto estiver pronto pra cliente externo.

### 7.3 Redirect URI em desenvolvimento (localhost)

Meta aceita `http://localhost:<port>/...` como redirect URI **explicitamente** pra dev. Pegadinhas comuns:

1. **Tem que ser `localhost`**, não `127.0.0.1` nem `0.0.0.0` — a Meta valida o hostname textualmente.
2. **Porta e path têm que bater exatamente** com o que tá no `META_OAUTH_REDIRECT_URI` do `.env`. Diferença de 1 caractere → "URL blocked".
3. **HTTP é permitido só pra `localhost`**. Qualquer outro host (mesmo `dev.bravy.local`) exige HTTPS.

### 7.4 Múltiplos ambientes no mesmo app

Em **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**, adicionar lista:

```
http://localhost:3001/api/v1/oauth/instagram/callback
https://staging.bravypublisher.com/api/v1/oauth/instagram/callback
https://app.bravypublisher.com/api/v1/oauth/instagram/callback
```

Cada `.env` (dev local, staging, prod) usa um valor diferente em `META_OAUTH_REDIRECT_URI` — Meta só valida que o valor enviado em runtime **está na lista**. App Meta é UM só, ambientes separados são UM problema só da infra.

### 7.5 Quando localhost **não** basta

Localhost direto funciona pra 95% do dev. Túnel HTTPS público só é necessário em 2 casos:

1. **Webhooks da Meta** (deletion callback, mention webhook, etc.) — Meta precisa fazer POST no backend pelos servidores deles, e não alcançam `localhost`. Usar **ngrok** ou **cloudflared**.
2. **Testar com sócio/cliente em outra máquina** que precisa acessar teu backend de dev.

Quando precisar:

```sh
ngrok http 3001
# pega a URL https://abc123.ngrok-free.app
```

Adiciona no app Meta como redirect URI: `https://abc123.ngrok-free.app/api/v1/oauth/instagram/callback` e troca o `.env` local. URL do ngrok grátis muda toda hora — pra fixar, plano pago do ngrok (subdomínio fixo) ou **Cloudflare Tunnel** ancorado num domínio próprio (`dev.bravypublisher.com`).

Webhooks da Meta só entram no Sprint 3+. Por enquanto, ignorar.

### 7.6 Steps de setup (resumo executável)

**Lado Meta (10–15 min, fazer 1 vez):**

1. Criar app Business em [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Adicionar produtos: **Facebook Login for Business** + **Instagram Graph API**
3. Em **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**, colocar:
   ```
   http://localhost:3001/api/v1/oauth/instagram/callback
   ```
4. **Settings → Basic** → copiar **App ID** e **App Secret**
5. **App Review → Permissions and Features** → request: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`
6. **Roles → Roles** → adicionar você como Tester (pra Development mode funcionar)
7. Garantir que a conta IG de teste é **Business** (não Personal) e está **linkada a uma Facebook Page** no mesmo Business Manager

**Lado local (2 min):**

8. Em `backend/.env`:
   ```
   META_APP_ID=<o-app-id>
   META_APP_SECRET=<o-app-secret>
   META_OAUTH_REDIRECT_URI=http://localhost:3001/api/v1/oauth/instagram/callback
   FRONTEND_URL=http://localhost:3000
   ```

9. Restart da API (matar PID antigo se houver):
   ```sh
   kill $(lsof -ti tcp:3001)
   cd /Users/jpasv/www/publisher/backend && yarn start:dev
   ```

10. Testar em `http://localhost:3000/settings/canais` → **Conectar conta** → Instagram → **Conectar** → autorizar no Facebook → volta com toast verde

**Erros comuns no callback:**

- `Page has no instagram_business_account linked` → conta IG não é Business OU não tá linkada a uma FB Page.
- `App not in Development for user` → falta adicionar você como Tester no app.
- Token exchange falhou → `META_APP_SECRET` errado no `.env`.

### 7.7 Dívidas técnicas pendentes do Sprint 2

- **Refresh real do Page Access Token** — implementação atual é stub ([token-refresh.service.ts](../src/modules/social-accounts/oauth/token-refresh.service.ts)). Pra fazer de verdade, armazenar o long-lived user token também (nova coluna criptografada em `SocialAccount` ou tabela `OAuthCredentials`). Vai naturalmente no Sprint 3.
- **LinkedIn OAuth flow** — adapter já implementado, mas o flow OAuth não. Entra no Sprint 4.
- **Endpoint de diagnose** (`GET /oauth/instagram/diagnose`) — opcional, mas paga sozinho se algum step do flow falhar em prod.
