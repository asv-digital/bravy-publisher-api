import { PatternInfo, VocabEntry } from '../types';
import { buildVocabLines } from './carousel-prompt';

export function buildThemeIdeasPrompt(params: {
  persona?: string;
  /** Descrição da persona (Persona.description do tenant); sem ela, usa o slug. */
  personaLabel?: string;
  pattern?: string;
  patterns: PatternInfo[];
  vocab: VocabEntry;
  hint?: string;
}): string {
  const { persona, personaLabel, pattern, patterns, vocab, hint } = params;

  const personaDesc = persona
    ? personaLabel || persona
    : 'profissionais e empresas que querem automatizar tarefas com IA';

  const activePattern = pattern
    ? patterns.find((p) => p.id === pattern)
    : undefined;

  const vocabLines = buildVocabLines(vocab);

  const vocabBlock = vocabLines.length
    ? `\n=== VOCABULARIO DO NICHO (use termos reais daqui) ===\n${vocabLines.join('\n')}\n`
    : '';

  const patternBlock = activePattern
    ? `\n=== PADRAO ESCOLHIDO ===\n${activePattern.id} - ${activePattern.nome}\nQuando usar: ${activePattern.quando_usar}\nEnviese as ideias para encaixar nesse padrao.\n`
    : '';

  const hintBlock = hint
    ? `\n=== DIRECAO DO USUARIO ===\nO usuario deu esta pista, use como ponto de partida: "${hint}"\n`
    : '';

  return `Voce e o estrategista de conteudo de um perfil profissional no Instagram que ensina profissionais a automatizarem o trabalho do dia a dia usando IA (Claude Code).

Sua tarefa: sugerir 3 TEMAS concretos de carrossel para a persona: ${personaDesc}.
${patternBlock}${vocabBlock}${hintBlock}
=== REGRAS DAS IDEIAS ===
- Cada tema deve ser uma frase curta e especifica (10 a 18 palavras), pronta pra colar no campo "tema".
- SEMPRE ancorado numa tarefa real e nomeada do dia a dia da persona (nao generico tipo "produtividade com IA").
- SEMPRE mencione Claude Code ou IA aplicada a uma operacao concreta da persona.
- Use ferramentas/obrigacoes/operacoes reais do vocabulario quando existir.
- Cada tema deve ser distinto dos outros (operacoes diferentes).
- Sem hashtags, sem emojis, sem aspas internas.

Exemplo de bom tema (persona contador):
"Recuperacao tributaria lendo 5 anos de SPED com Claude Code em vez de 3 dias no Excel"

Responda APENAS com JSON valido neste formato, sem texto antes ou depois:
{"ideas": ["tema 1", "tema 2", "tema 3"]}`;
}
