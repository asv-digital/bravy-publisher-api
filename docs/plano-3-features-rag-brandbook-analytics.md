# Publisher — 3 novas features: Base de Conhecimento (RAG), Brand Book e Analytics Estratégico

## Context

O publisher gera carrosséis com IA (Anthropic/Claude) e publica nas redes. Hoje a IA escreve a partir de
datasets estáticos (`padroes_validados.json`, `top_carrosseis.json`, `vocab.json`) e o design vem de um
`BrandKit` editado à mão. O usuário precisa de três capacidades novas para o produto ficar estratégico:

1. **Base de conhecimento (RAG)** — subir vários arquivos (`.md/.pdf/.csv/.png/.jpg`) que viram fonte de
   conhecimento da empresa; ao gerar um post, trechos relevantes são recuperados e injetados no prompt para
   o conteúdo ser fiel à realidade da empresa (números, sistemas, processos reais).
2. **Brand book (design system + voz)** — subir logo, cores e tipografia da marca para que templates/designs
   sigam o style guide; além do visual, um campo opcional de **voz da marca** guia o tom do texto gerado.
3. **Analytics estratégico** — a página `/analytics` deve mostrar **rankings dos melhores conteúdos** por
   curtidas, comentários, compartilhamentos, saves e reposts, cada item com **preview do post** e **link pra
   postagem na rede**.

**Stack** (confirmado lendo o código): Backend NestJS + Prisma + PostgreSQL + Redis/BullMQ + MinIO (S3),
Anthropic SDK; prefixo global `/api/v1`; multi-tenant via `tenantId`; worker separado (`worker.ts`/
`worker.module.ts`). Frontend Next.js 16 App Router + `@base-ui/react` + Zustand + React Query + Axios;
canvas via `packages/scene-engine` (Konva). Charts em `@tremor/react`.

## Decisões do usuário (já confirmadas)

- **Embeddings: OpenAI** `text-embedding-3-small` (1536 dims) → coluna `vector(1536)`, env `OPENAI_API_KEY`.
- **Analytics: só Instagram** nesta fase (LinkedIn/TikTok/X ficam atrás da mesma interface, fase 2).
- **Brand book: visual + voz** — logo/cores/tipografia **e** campo de voz que alimenta o prompt de texto.
- **Brand book input: manual + extração por IA** — upload manual de logo + pickers, **e** "importar do brand
  book" (sobe PDF/imagem → Claude vision extrai cores/fontes como **sugestão** pra revisar).

---

## Mudanças de infraestrutura compartilhadas

- **pgvector**: trocar a imagem do Postgres de `postgres:16-alpine` → `pgvector/pgvector:pg16` em
  `docker-compose.yml` (mesmo volume/data dir). Em prod, garantir a extensão habilitada. `CREATE EXTENSION
  vector` entra via migration raw SQL.
- **Worker**: todo processor BullMQ novo precisa ser registrado **em `app.module.ts` (produtor) E em
  `worker.module.ts` (consumidor)** — mesmo padrão de `RenderModule`/`PublishingModule`.
- **Novos envs**: `OPENAI_API_KEY`, `EMBEDDING_MODEL` (default `text-embedding-3-small`), limites de KB
  (`KB_MAX_FILE_MB`, `KB_MAX_TENANT_MB`, `KB_TOP_K`), `METRICS_REFRESH_CRON`, `METRICS_WINDOW_DAYS`.
- **Reuso direto**: MinIO client `backend/src/database/minio.client.ts` (`putBuffer`/`getObject`/`removeObjects`/
  `publicUrl`); upload via `FileInterceptor`/`FilesInterceptor` (`@nestjs/platform-express`, multer já presente);
  arquivos servidos por `GET /api/v1/files/*` (`backend/src/modules/files/files.controller.ts`); structured
  output + repair loop do `generation.service.ts` (`completeJson`); `EncryptionService` (global).

---

## Feature 1 — Base de Conhecimento (RAG)

### Dados (Prisma — `backend/prisma/schema.prisma`)
- `enum KnowledgeStatus { PENDING PROCESSING READY FAILED }`.
- `KnowledgeSource`: `id, tenantId, fileName, mimeType, fileKey, size, status, error?, pageCount?, rowCount?,
  chunkCount, contentHash?, bullJobId?, createdAt, updatedAt` + relação `chunks`. Índice `@@index([tenantId, status])`.
  `contentHash` + `@@unique([tenantId, contentHash])` pra dedup.
- `KnowledgeChunk`: `id, sourceId, tenantId (denormalizado), chunkIndex, text, tokenCount, metadata?, createdAt`.
  Coluna `embedding vector(1536)` **não** é gerenciada pelo Prisma → adicionar via raw SQL na migration.
- Back-ref `knowledgeSources` em `Tenant` (cascade no delete do tenant). FK `source` com `onDelete: Cascade`.

**Migration** (`prisma migrate dev --create-only` e editar `migration.sql`):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "knowledge_chunks" ADD COLUMN "embedding" vector(1536);
CREATE INDEX "knowledge_chunks_embedding_hnsw" ON "knowledge_chunks"
  USING hnsw ("embedding" vector_cosine_ops);
```
Escritas/leituras de vetor via `$executeRaw`/`$queryRaw` (literal `'[v1,v2,...]'::vector`, operador `<=>`).

### Embeddings (OpenAI, atrás de interface plugável)
- `backend/src/modules/knowledge/embeddings/embedding-provider.interface.ts`:
  `EmbeddingProvider { id; dimensions; embedBatch(texts, kind): Promise<number[][]> }` + token `EMBEDDING_PROVIDER`.
- `openai.provider.ts` chamando `POST https://api.openai.com/v1/embeddings` (model `text-embedding-3-small`,
  1536 dims) via `fetch` global — **sem SDK novo**. Batch ~128 textos/request. Assert no boot:
  `provider.dimensions === 1536` (== coluna do DB) pra impedir corromper o índice.

### Pipeline de ingestão (módulo `backend/src/modules/knowledge/`)
`knowledge.module.ts` (registra fila `knowledge-ingest`, controller, service, retrieval service, provider; **exporta
`KnowledgeRetrievalService`**), `knowledge.controller.ts`, `knowledge.service.ts`, `knowledge.processor.ts`
(consumidor — espelhar `render.processor.ts`: status PENDING→PROCESSING→READY/FAILED), `knowledge-retrieval.service.ts`,
`ingestion/parsers.ts`, `ingestion/chunker.ts`, `dto/`.

- `KnowledgeService.createSources(files, tenantId)`: valida quantidade/tamanho/mimetype/total do tenant; cria
  `KnowledgeSource` PENDING; sobe raw no MinIO (`kb/<tenantId>/<sourceId>/<arquivo>`); enfileira
  `knowledge-ingest` (`attempts:3` + backoff exponencial).
- `KnowledgeProcessor`: baixa do MinIO → parseia por tipo:
  - `.md` → texto (mantém headings/listas).
  - `.pdf` → `unpdf` (ESM, traz pdfjs) → `{ text, totalPages }`; PDF escaneado (texto ~vazio) → READY com aviso 0 chunks.
  - `.csv` → `papaparse`; cada linha vira `"col: valor | col: valor"`, header como contexto.
  - `.png/.jpg` → **caption via Claude Haiku vision** (imagem → descrição factual densa) pra ficar pesquisável;
    guarda a key da imagem em `metadata`.
  - Chunk ~400 tokens, ~15% overlap (token count via heurística `chars/4` ou `gpt-tokenizer`).
  - Embeda os chunks (`embedBatch(..., 'document')`) e faz upsert via `$executeRaw` (idempotente: apaga chunks
    do source antes de reinserir). Atualiza `chunkCount` e status READY (ou FAILED + error).

### Recuperação + injeção no prompt
- `KnowledgeRetrievalService.retrieve(query, tenantId, k=6)`: short-circuit se o tenant não tem source READY
  (tenant sem KB não paga nada e o prompt fica idêntico). Embeda a query (`tema` + persona), busca por
  similaridade via `$queryRaw` (`WHERE tenant_id = $1 ORDER BY embedding <=> $2 LIMIT k`), com piso de
  similaridade pra cortar ruído.
- Hook em `backend/src/modules/generation/generation.service.ts` (`generate()`): injetar os trechos no
  **`userPrompt` (parte NÃO cacheada)** — o `system` cacheado (`buildSystemPrompt`) fica intacto, então o prompt
  cache continua quente. Bloco `=== BASE DE CONHECIMENTO DA EMPRESA ===` com 1 linha autorizando o modelo a
  citar números/leis/sistemas que aparecem na base como fatos fundamentados (isso é o ponto da feature e precisa
  destravar a guardrail anti-invenção do `carousel-prompt.ts`). Atualizar a linha que persiste `Generation.prompt`
  pra refletir o que o modelo viu. v1: só em `generate()` (regenerate-slide fica pra depois).

### API + Frontend
- Endpoints (tenant-scoped via `@CurrentUser`): `POST /knowledge/upload` (`FilesInterceptor('files', 20)`),
  `GET /knowledge` (lista com status), `GET /knowledge/:id`, `DELETE /knowledge/:id` (cascade chunks + remove
  objeto MinIO), `POST /knowledge/:id/reprocess`. Arquivos KB são privados (não usar o proxy `@Public()` `/files`).
- Frontend: nova aba `/settings/conhecimento` (add no array `tabs` de `frontend/src/app/(app)/settings/layout.tsx`).
  `frontend/src/features/knowledge/`: `api/knowledge-api.ts` (FormData multipart), `hooks/use-knowledge-sources.ts`
  (`useQuery` com `refetchInterval` enquanto houver PENDING/PROCESSING), `hooks/use-knowledge-mutations.ts`,
  `components/knowledge-uploader.tsx` (drag-and-drop sobre input multiple `accept=".md,.pdf,.csv,.png,.jpg"`),
  `components/knowledge-list.tsx` (Table + Badge de status + delete/reprocess). Só componentes de `components/ui/`.

### Deps & edge cases
- Backend: `unpdf`, `papaparse` (+types), `gpt-tokenizer` (opcional). Sem SDK de embeddings (REST via fetch).
- Limites por arquivo (20MB) e por tenant; dedup por hash; troca de provider exige re-embed (reprocess);
  cascade de delete; PDFs gigantes com cap de páginas/chars; busca sempre parametrizada e scoped por `tenantId`.

---

## Feature 2 — Brand Book (visual + voz)

> **Fato arquitetural decisivo**: existem dois renderers. O **scene-engine** (`packages/scene-engine/`) é
> brand-aware e já consome o `BrandKit`; o **legacy Playwright** (`backend/src/modules/render/template-engine.*`)
> **não** é brand-aware (hardcoda o glifo `✻` e a paleta). **Recomendação: rotear o render de publicação pelo
> scene-engine** (`renderScenePng` do `@publisher/scene-engine/node`, que o shadow-compare já usa em
> `render.service.ts`) pra ter um único renderer com a marca aplicada. Caso contrário a logo/cores não aparecem
> nos PNGs publicados.

### Dados (estender `model BrandKit`, tudo nullable — versionamento/snapshot já existem)
`logoUrl, logoKey, logoDarkUrl, logoDarkKey, logoMime, logoAspect, customFonts (Json: BrandFontEntry[]),
brandColors (Json: {primary, secondary?, accent?, neutralDark?, neutralLight?}), voice (Text), sourceFileKey`.
Migration aditiva (`brandkit_brand_identity`). Manter `logoGlyph` como fallback. Sincronizar os tipos
`ApiBrandKit` (frontend) e `BrandKit` (scene-engine) + os seeds em `brand-kit.service.ts` e
`scene-engine/src/brand-kit.ts`.

### Logo como imagem real
- `POST /brand-kit/logo` (+ `/logo/dark`): valida MIME (`png/jpeg/svg+xml/webp`), cap de tamanho. **SVG: sanitizar**
  (remover `<script>`/`on*`/refs externas via DOMPurify+jsdom ou svgo) **e** rasterizar PNG 512px (Skia não desenha
  SVG). Calcula `logoAspect` (`sharp` p/ raster, viewBox p/ SVG). Sobe no MinIO, persiste na kit e **bump version**.
- scene-engine: `brand-kit.ts`/`tokens.ts` expõem `tokens.logo` + `tokens.logoFor('light'|'dark')`. Helper
  `pushLogo(...)` substitui o glifo asterisco em `templates/step.ts` (cover/cta), `compendium.ts`, `tweet.ts` —
  emite `ImageNode` (`fit:'contain'`, nunca corta) com fallback ao `logoGlyph`. CTA/term* = superfície escura → `darkUrl`.
- Painter: browser já suporta `case 'image'` (`paint.ts` + `resolveSceneImage`). **Server (Skia) precisa de
  `resolveImage`**: hoje `node/render.ts` nunca seta isso → image nodes viram caixa cinza. Adicionar pré-resolução
  assíncrona das srcs (raster via `loadImage`; SVG → usar o PNG rasterizado) antes do `paintSlide`.

### Fontes da marca
- `POST /fonts/upload` (`.ttf/.otf/.woff2`, exige `licenseAck`): parsear com **`fontkit`** (já é dep) pra ler
  family/weight/italic reais (não confiar no nome do arquivo) → garante paridade browser↔Skia. Converter
  woff2→ttf no upload se o Skia não carregar woff2. Guarda no MinIO, anexa `BrandFontEntry` em `customFonts`, version-bump.
- scene-engine **node** (`node/render.ts`/`node/fonts.ts`): hoje só registra as 4 fontes seed → qualquer Google/upload
  cai silenciosamente no fallback (bug latente). Adicionar registro das fontes da kit (Google cacheadas + uploads)
  via `FontLibrary.use` + mapa `FontkitMetrics`. Browser (`browser-metrics.ts`): generalizar `loadGoogleFamily` →
  `loadRemoteFamily` que também trata `source:'upload'`.

### Cores
- `palette-map.ts` (puro, isomórfico) `paletteFromBrandColors(input) → 16 tokens` (bg/ink/accent/term* derivados de
  primary/secondary/accent/neutral*), com **guard de contraste WCAG** (ink↔bg ≥4.5, accent↔bg ≥3, ajustando L).
- Extração de cores do logo: `node-vibrant` (ou median-cut via `sharp`) → `POST /brand-kit/logo/colors` retorna
  swatches + `suggestion: BrandColorsInput` (sugestão, não aplica).

### Extração por IA do brand book (Claude vision)
- `POST /brand-kit/extract` (PDF/imagem): guarda raw → `sourceFileKey`; monta content blocks (`document` base64 p/
  PDF, cap ~5 páginas via `pdf-lib`; `image` p/ imagem) + instrução; reusa `completeJson` (generalizar p/ aceitar
  array de content). Schema Zod `BrandExtraction` (colors hex, typography names, logo desc, voice, confidence).
  Mapeia cores → `paletteFromBrandColors` (preview), typography → `fontCatalog.search`. **Suggestion-only**: pré-preenche
  o editor; nada é salvo até o usuário clicar Salvar.

### Voz da marca → texto (decisão "visual + voz")
- `generation.service.ts` já carrega `brandKit` no `generate()` — incluir `voice` no select e passar pra
  `buildSystemPrompt`. Em `carousel-prompt.ts`, seção curta e delimitada `=== VOZ DA MARCA ===` ("Use este tom:
  <voice>. Não invente fatos.") — opcional/aditiva, sem sobrepor os datasets de persona. Só tom, não fatos
  (fatos vêm da base de conhecimento).

### Frontend (`BrandKitEditor.tsx` em `/settings/marca`)
- Seção logo (upload light/dark + preview sobre fundo claro e escuro + "derivar paleta do logo").
- Tipografia: "upload de fonte" por role (com checkbox de licença) além do catálogo Google.
- Cores: inputs primary/secondary/accent + "aplicar nos 16 tokens" (chama `paletteFromBrandColors` client-side).
- "Importar do brand book": file picker → `POST /brand-kit/extract` → modal de revisão (cores/fontes/voz editáveis +
  confidence + aviso "sugestão") → aplica no rascunho (salva no `PATCH /brand-kit` normal).
- Campo "voz da marca" (textarea) no editor. Versionamento já garante que mudar a marca não altera posts antigos
  (Content faz snapshot de `brandKitId/brandKitVersion/styleData`).

### Deps
`sharp` (+`@resvg/resvg-js` se preciso), `node-vibrant`, sanitizer SVG (`dompurify`+`jsdom` ou `svgo`), `pdf-lib`,
util de cor (`culori`/`chroma-js` ou HSL inline). scene-engine sem deps runtime novas (já usa `fontkit`/`skia-canvas`).

---

## Feature 3 — Analytics Estratégico (só Instagram nesta fase)

> Hoje a página `/analytics` e o módulo backend **já existem mas rodam em MOCK**, e **nada coleta métrica real**
> das redes (o `Analytics` ficaria zerado). O coração da feature é construir a coleta de insights.

### Dados (`backend/prisma/schema.prisma`)
- `Analytics`: adicionar `reposts Int @default(0)` (Instagram não tem reposts → fica 0/`—`); índice
  `@@index([publishTargetId, fetchedAt(sort: Desc)])`. Rankings usam **sempre o snapshot mais recente** por target
  (`analytics { orderBy:{fetchedAt:'desc'}, take:1 }`) — nunca somar snapshots.
- `PublishTarget`: adicionar `permalink String?` (URL canônica do post). Migration aditiva
  (`analytics_reposts_and_permalink`).

### Coleta de insights (Instagram)
- `base-adapter.ts`: `InsightsResult { likes, comments, shares, saves, reposts, reach, impressions, permalink,
  fetchedAt }` (cada métrica `number|null` pra distinguir "não existe" de "zero") + método opcional
  `fetchInsights?(externalMediaId, ctx)`. `adapter-registry.ts`: `getByPlatform(platform)`.
- `instagram-client.ts` → `fetchInsights`: `GET /{media-id}?fields=permalink,like_count,comments_count` +
  `GET /{media-id}/insights?metric=reach,saved,shares,views`. Map: likes/comments/saves(`saved`)/shares/reach/
  impressions(`views`); reposts=null; **permalink** persiste em `PublishTarget.permalink`. **Exige scope
  `instagram_manage_insights`** — adicionar em `REQUIRED_SCOPES` (`instagram-oauth.service.ts`) e o usuário
  **reconecta a conta** (App Review aprovado). Token via `EncryptionService.decrypt`; refresh via
  `InstagramOAuthService.refreshPageToken` no 401.
- LinkedIn/TikTok/X: deixar a mesma assinatura `fetchInsights` documentada como fase 2 (a cron filtra plataformas
  sem adapter de insights).

### Pipeline (cron + fila + processor) — espelhar publish
- Fila BullMQ `metrics`. Módulo novo `backend/src/modules/metrics/`: `metrics-cron.service.ts`
  (`@Cron` horário, busca `PublishTarget` COMPLETED com `externalMediaId` e `publishedAt >= now-WINDOW`,
  plataforma INSTAGRAM, `addBulk`), `metrics.processor.ts` (`@Processor('metrics', {concurrency:1})`: chama
  `fetchInsights`, cria `Analytics` novo com `engagementRate` calculado, grava `permalink`; 404 → `markStale`,
  erro transiente → backoff). `metrics.config.ts`. Registrar módulo em `app.module.ts` **e** `worker.module.ts`
  (+ `CommonModule` no worker p/ `EncryptionService`); exportar `PublishAdapterRegistry` de `publishing.module.ts`.
  Cadência escalonada opcional (posts novos com mais frequência) pra economizar quota. Backfill: a 1ª execução
  pega todos os COMPLETED dentro da janela.

### Ranking enriquecido (`analytics.service.ts` `ranking()`)
- DTO `sortBy` com `@IsIn(['likes','comments','shares','saves','reposts','reach','impressions','engagementRate'])`
  + `period`. Um só endpoint dirigido por `sortBy` (a UI troca métrica por tabs).
- `include` puxa o slide COVER (`content.slides where slideType=COVER take 1`, fallback position 0) p/ thumbnail.
- Cada item achatado pro shape que o front espera (corrige mismatch atual): `{ contentId, publishTargetId, slug,
  persona, pattern, platform, accountName, publishedAt, thumbnailUrl, permalink, analytics{...reposts} }`.
- Envelope `{ data, total, page, pageSize, totalPages }`. Filtra `status=COMPLETED` + `analytics: { some: {} }`
  + período.
- `permalink.util.ts`: builder por plataforma (IG = `permalink` da API/stored; LinkedIn = URL do URN; etc.).

### Frontend (`frontend/src/features/analytics/`)
- **De-mock**: `NEXT_PUBLIC_MOCK=false` + `NEXT_PUBLIC_API_URL` apontando pro backend (conferir prefixo `/api/v1`).
  Corrigir `analytics-api.ts`: `getAnalyticsSummary` deve chamar `/analytics/dashboard` (não `/summary`) e
  reconciliar o tipo `AnalyticsSummary` com o `dashboard()` real.
- **Metric switcher**: novo `ranking-metric-switcher.tsx` (ToggleGroup, igual ao period selector): **Curtidas |
  Comentários | Compartilhamentos | Saves | Reposts**. `use-ranking.ts` aceita `sortBy` (entra no queryKey + params).
- **Linha do ranking**: preview do cover (`thumbnailUrl` via `/files`, placeholder se ausente), badge de persona
  (`PERSONA_COLORS`), valor da métrica ativa em destaque, e botão âncora `ExternalLink` (`target=_blank`) pro
  `permalink` (some se null) + glifo da plataforma.
- Types: `reposts` em `AnalyticsData`; `permalink/platform/accountName/publishTargetId` em `RankingItem`; tipo
  `RankingMetric`. Estados vazios: sem posts ("Nenhum post publicado ainda") e com posts sem snapshot ("Métricas
  sendo coletadas").
- Endpoint admin opcional `POST /analytics/metrics/refresh` pra disparar a coleta na hora (teste/backfill).

### Edge cases
Métrica inexistente na plataforma → `—` (mapa de métricas suportadas por plataforma), não 0; post deletado na
rede (404) → stale sem mexer no status; token expirado → refresh existente; rate limit → cron janelado +
concurrency 1 + backoff; conteúdo sem cover renderizado → placeholder.

---

## Ordem de construção sugerida

1. **Infra compartilhada**: imagem pgvector no compose; envs (`OPENAI_API_KEY`, etc.); `CommonModule` no worker.
2. **Feature 1 (RAG)** backend → frontend: schema+migration vetor → provider OpenAI → módulo+controller → parsers+
   chunker+processor → retrieval+wiring no `generate()` → página `/settings/conhecimento`.
3. **Feature 2 (Brand Book)**: migration BrandKit → scene-engine (tokens/logo/palette-map/fontes node) → endpoints
   logo/fonte/cores/extract → voz no prompt → `BrandKitEditor`. Definir o renderer de publicação (scene-engine).
4. **Feature 3 (Analytics)**: migration (`reposts`/`permalink`) → `fetchInsights` Instagram (+ scope/reconnect) →
   cron+processor `metrics` → enriquecer `ranking()` → frontend (de-mock + switcher + preview + link).

(As três são independentes e podem ser tocadas em paralelo por devs diferentes; cada uma é backend-first.)

## Verificação (end-to-end)

- **RAG**: `\dx` mostra `vector`; coluna `embedding vector(1536)` + índice HNSW. Subir `.md/.pdf/.csv/.png` →
  sources viram READY com `chunkCount>0`. `retrieve('<tema coberto>')` devolve o trecho certo. Gerar carrossel
  com `tema` ligado à KB → inspecionar `Generation.prompt` (bloco `=== BASE DE CONHECIMENTO ===` presente) e ver
  os slides citando os fatos reais. Confirmar cache quente (system reaproveitado) em 2 gerações de temas distintos.
  Tenant sem KB → prompt inalterado, sem chamada de embedding. Delete remove chunks + objeto MinIO.
- **Brand book**: em `/settings/marca` subir logo + cores (derivar) + fonte → preview mostra logo/fontes/cores.
  Gerar carrossel novo → no studio o cover/CTA renderiza a **imagem do logo** (não o asterisco) com fonte/paleta
  da marca; exportar e conferir o PNG no MinIO. Rodar `RENDER_SHADOW_SKIA=1` (ou o render server) pra paridade
  browser↔Skia. `POST /brand-kit/extract` com um PDF de marca real → sugestão válida (shape + hex), nada aplicado
  até Salvar. Definir um `voice` → texto gerado adota o tom.
- **Analytics**: ter um `PublishTarget` COMPLETED com `externalMediaId` real (Instagram). Disparar
  `POST /analytics/metrics/refresh` → novo `Analytics` com números reais + `permalink` setado. `GET
  /analytics/ranking?sortBy=likes&period=30d` retorna itens enriquecidos (thumbnail + permalink + persona,
  envelope `{data,total,page,pageSize,totalPages}`). Abrir `/analytics` (`NEXT_PUBLIC_MOCK=false`), alternar as
  tabs (Curtidas→Comentários→Compartilhamentos→Saves→Reposts), ver preview + métrica em destaque e clicar no link
  abrindo o post no Instagram. Conferir estados vazios.

## Arquivos críticos

**RAG**: `backend/prisma/schema.prisma`, `backend/src/modules/knowledge/*` (novo),
`backend/src/modules/generation/generation.service.ts`, `backend/src/modules/generation/prompts/carousel-prompt.ts`,
`backend/src/worker.module.ts`, `frontend/src/app/(app)/settings/layout.tsx`, `frontend/src/features/knowledge/*` (novo).

**Brand book**: `backend/prisma/schema.prisma`, `backend/src/modules/brand-kit/brand-kit.service.ts`,
`packages/scene-engine/src/templates/step.ts` (+`compendium.ts`/`tweet.ts`), `packages/scene-engine/src/node/render.ts`,
`packages/scene-engine/src/{brand-kit,tokens,palette-map}.ts`, `frontend/src/features/content/studio/BrandKitEditor.tsx`,
`frontend/src/features/content/studio/lib/browser-metrics.ts`.

**Analytics**: `backend/prisma/schema.prisma`, `backend/src/modules/analytics/analytics.service.ts`,
`backend/src/modules/publishing/adapters/instagram-client.ts`, `backend/src/modules/metrics/*` (novo, espelha
`schedules/publish-cron.service.ts` + `publishing/publishing.processor.ts`),
`frontend/src/features/analytics/components/analytics-ranking-table.tsx`.
