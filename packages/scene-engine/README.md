# @publisher/scene-engine

Engine de cena **determinístico e isomórfico** para os carrosséis 1080×1080.
Substitui o pipeline antigo `HTML/CSS → Playwright → PNG` (ver RFC em
`~/.claude/plans/atue-como-um-engenheiro-snazzy-sifakis.md`).

## Ideia central

Uma única fonte de verdade (`DesignDocument`) → função pura `resolveScene()` →
`SceneGraph` → pintado pelo `paintSlide()` em **qualquer** `CanvasRenderingContext2D`
(skia-canvas no Node, canvas do browser no client). Mesma cena nos dois lados.

```
DesignDocument ──resolveScene(doc, metrics, brandKit)──▶ SceneGraph ──paintSlide(ctx)──▶ pixels
```

## Por que é determinístico

O layout de texto **não** usa `ctx.measureText` (diverge entre runtimes). Mede pelo
**advanceWidth do arquivo de fonte** via `fontkit` (`text/metrics.ts`) e desenha
**glifo-a-glifo** nas posições calculadas (`paint.ts`). Mesmos bytes de fonte →
mesma quebra de linha → mesma cena no browser e no server.

## Mapa

| Arquivo | Papel |
|---|---|
| `brand-kit.ts` | `BrandKit` por tenant (tipografia/paleta/strings). `SEED_BRAND_KIT` = editorial JP.ASV. **Tokens não são hardcoded.** |
| `tokens.ts` | `resolveTokens(kit)` → API por papel/cor que os templates consomem |
| `scene.ts` | `SceneGraph` / `SceneNode` (rect, line, glyphrun, image) |
| `doc.ts` | `DesignDocument`, `ContentText`, `OverrideMap`, `SlideImage` |
| `ids.ts` | IDs de nó estáveis (overrides sobrevivem à regeneração) |
| `text/metrics.ts` | métricas via fontkit (variable fonts via `getVariation`) |
| `text/runs.ts` | ContentText → StyledRun[] + parser inline (`<em>/<strong>/<code>`) |
| `text/layout.ts` | quebra gulosa + baseline mista + auto-fit (shrink-to-fit) |
| `paint.ts` | painter 2D agnóstico (Node/browser) |
| `templates/step.ts` | port 1:1 do template "step" (cover/body/cta) |
| `resolve.ts` | `resolveScene()` — aplica overrides + monta cena |
| `node/fonts.ts` | loader Node-only das fontes seed (POC + worker) |

## Rodar a POC

```bash
pnpm install      # baixa skia-canvas (binário) — onlyBuiltDependencies já liberado
pnpm poc          # gera out/*.png (cover, bullets, stats, cards, cta)
pnpm typecheck
pnpm build
```

## Status / próximos passos

- **Sprint 1 (feito):** engine + step + POC skia. Fidelidade editorial validada visualmente.
- Pendências conhecidas: keyword-pill do CTA (hoje render como texto mono), família
  `compendium` (Sprint 3), golden-diff formal vs worker antigo (quando houver referência).
- Integração browser (`react-konva` para interação) e worker NestJS: Sprints 2 e 4.
- Fontes: hoje os 3 TTFs do seed em `fonts/`. Catálogo dinâmico Google Fonts: Sprint 6.
