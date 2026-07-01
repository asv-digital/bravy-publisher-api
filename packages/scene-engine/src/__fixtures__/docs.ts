/**
 * DesignDocs golden de teste (RFC §1 — __fixtures__).
 * EDITORIAL = o documento canônico (mesmo do PoC). STRESS = headline/CTA
 * absurdamente longos p/ provar que o auto-fit não estoura a caixa.
 */
import type { DesignDocument } from '../doc.js';

export const EDITORIAL_DOC: DesignDocument = {
  schemaVersion: 1,
  content: {
    slug: 'pis-cofins-no-sped',
    template: 'step',
    persona: 'contador',
    labelTopoCapa: 'CLAUDE CODE BR',
    labelCapa: 'O ERRO DE R$ 30 MIL/ANO',
    hookCapa: 'Todo mês some dinheiro no <em>lugar errado</em>',
    slides: [
      {
        tag: 'onde todo mundo escorrega',
        headlineTop: 'O cliente',
        headlineEm: 'erra',
        headlineBottom: 'e ninguém percebe',
        list: [
          'Crédito de <strong>PIS/COFINS</strong> lançado na conta errada do plano.',
          'O <code>SPED</code> aceita — a malha fina cruza seis meses depois, calada.',
          'A autuação chega com <em>75% de multa</em> mais juros Selic acumulados.',
        ],
      },
      {
        tag: 'o tamanho do rombo',
        headlineTop: 'Não é',
        headlineEm: 'centavo',
        headlineBottom: 'é o ano inteiro',
        stats: [
          ['R$ 30 mil', 'recuperados num único cliente médio por ano de revisão.'],
          ['6 meses', 'é o atraso típico entre o erro e a notificação da Receita.'],
          ['75%', 'de multa sobre o débito apurado em autuação de ofício.'],
        ],
      },
      {
        tag: 'como blindar',
        headlineTop: 'Dois',
        headlineEm: 'checks',
        headlineBottom: 'antes de transmitir',
        cards: [
          { label: 'ANTES', icon: '①', title: 'Concilia o crédito', body: 'Cruza o razão com o bloco <em>M</em> do SPED Contribuições.', highlight: false },
          { label: 'DEPOIS', icon: '②', title: 'Valida a apuração', body: 'Confere CST e base antes do <code>fechamento</code>.', highlight: true },
        ],
      },
    ],
    ctaLabelTopo: 'tá na hora',
    ctaLabel: 'leva 2 minutos pra colar',
    ctaText: 'Comenta <span class="keyword">hoje</span> e te mando o <em>checklist</em>',
    ctaSub: 'Sem te cobrar nada.',
    caption: 'Salva esse post pra revisar antes do próximo SPED.',
  },
};

/** Headline/hook/CTA gigantes — gate de auto-fit (não pode estourar a caixa). */
export const STRESS_DOC: DesignDocument = {
  schemaVersion: 1,
  content: {
    slug: 'stress-autofit',
    template: 'step',
    labelCapa: 'TESTE DE ESTRESSE TIPOGRÁFICO COM RÓTULO MUITO COMPRIDO',
    hookCapa:
      'Esse é um hook de capa propositalmente <em>interminável</em> que descreve em detalhe excessivo o problema inteiro numa frase só pra forçar o motor a encolher e ainda assim caber dentro da moldura sem vazar uma única linha pra fora',
    slides: [
      {
        tag: 'uma tag que também é desnecessariamente longa pra testar o kicker',
        headlineTop: 'Uma manchete extremamente longa que precisa',
        headlineEm: 'encolher bastante',
        headlineBottom: 'e mesmo assim permanecer inteiramente dentro da caixa reservada',
        list: [
          'Um bullet com bastante texto <strong>importante</strong> que ocupa várias linhas pra empurrar o layout até o limite inferior do slide sem transbordar.',
          'Outro item igualmente extenso reforçando que mesmo com muito conteúdo o fluxo vertical tem que se comportar.',
        ],
      },
    ],
    ctaLabelTopo: 'agora',
    ctaLabel: 'um rótulo de cta longo o suficiente pra quebrar em duas linhas tranquilamente',
    ctaText:
      'Um call to action gigantesco que insiste em <em>ocupar todo o espaço</em> disponível e ainda pede pra você comentar, salvar e compartilhar tudo de uma vez só agora mesmo',
    ctaSub: 'Subtítulo também alongado só por garantia.',
  },
};

/** Família compendium (terminal box). */
export const COMPENDIUM_DOC: DesignDocument = {
  schemaVersion: 1,
  content: {
    slug: 'compendium-claude-code',
    template: 'compendium',
    labelCapa: 'CLAUDE CODE BR',
    hookCapa: 'O jeito certo de <em>operar</em> a IA',
    slides: [
      {
        tag: 'os três comandos que importam',
        list: [
          'Escreva a <strong>base de conhecimento</strong> antes de qualquer prompt.',
          'Peça o <em>schema</em> primeiro — depois controller, depois service.',
          'Uma feature por ciclo: testa, commita, avança.',
        ],
      },
      {
        tag: 'o tamanho do ganho',
        stats: [
          ['USD 15k/mês', 'economizados trocando ferramentas por sistemas próprios.'],
          ['1 pessoa', 'opera o que antes exigia um time inteiro.'],
        ],
      },
    ],
    ctaText: 'Se você usar isso direito, não precisa de prompt mágico',
    ctaSub: 'Comenta <span class="keyword">hoje</span> pra receber a aula gratuita.',
    caption: 'Salva pra revisar antes do próximo projeto.',
  },
};

export interface Fixture {
  name: string;
  doc: DesignDocument;
  /** índices de slide que entram no gate de golden visual. */
  goldenSlides: number[];
}

export const FIXTURES: Fixture[] = [
  { name: 'editorial', doc: EDITORIAL_DOC, goldenSlides: [0, 1, 2, 3, 4] },
  { name: 'stress', doc: STRESS_DOC, goldenSlides: [0, 1, 2] },
  { name: 'compendium', doc: COMPENDIUM_DOC, goldenSlides: [0, 1, 2, 3] },
];
