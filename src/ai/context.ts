/** 呼び出しの設定（settings.ts の AiSettings の一部。ここは DB に依存させない） */
export interface RequestSettings {
  model: string
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
}

// API に送る文脈の組み立て（純粋な関数。テストでスナップショットを取る）。
// 約束：現在ページより後ろの文字は決して送らない。呼び手が渡す文字も、ここで改めて絞る。

export const ASK_SYSTEM = `あなたは、読み手が本を自分の頭で読むのを隣で手伝う読書の相棒です。
約束：
- 読み手がまだ読んでいないページの内容には触れない。渡された現在ページまでの文字だけを根拠にし、先の展開を明かさない。
- 読み手の文章を書き直さない。
- なぞった一節は指で選んだもので、端が少しこぼれたり欠けたりしている。前後の文から、読み手が指したかった範囲を汲んで答える。
- 要約で済ませず、読み手が自分で考える手がかりになる答えにする。
- 日本語で答える。speech は声に出して読む一文（40字程度まで）、detail は画面に出す補足（Markdown 可、短めに）。
- 図が理解を大きく助けるときだけ figure に題・大きさ（inline か page）・種類を入れ、そうでなければ null。
- concepts には、この一節の鍵になる概念を最大3つ。`

export const GAP_SYSTEM = `あなたは、読み手が自分の言葉で書いた節のまとめを読む相棒です。
約束：
- まとめを書き直さない。言い換え・添削・模範解答を出さない。
- 節の本文に照らして、まとめから抜けている大事な点を「一つだけ」、短く指摘する（どこを読み返せばよいかの手がかりを添えてよい）。
- 読み手がまだ読んでいないページの内容には触れない。
- 日本語で、2文以内。`

export interface PastQuestion {
  page: number
  question: string
  answerSpeech: string
}

export interface AskInput {
  bookTitle: string
  chapter: string
  section: string
  page: number
  passageText: string
  /** なぞった範囲を canvas から切り出した PNG（base64、data: は付けない） */
  passageImage: string | null
  /** 一節を含む文と前後の文（現在ページの中から） */
  surrounding: string
  /** 現在ページの文字 */
  pageText: string
  pastQuestions: PastQuestion[]
  question: string
}

type TextBlock = { type: 'text'; text: string }
type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }

export interface BuiltRequest {
  model: string
  max_tokens: number
  system: string
  effort: RequestSettings['effort']
  messages: { role: 'user'; content: (TextBlock | ImageBlock)[] }[]
}

/** 同じ章の最近の問いのうち、何件まで添えるか */
export const PAST_QUESTIONS_LIMIT = 5

export function buildAskRequest(input: AskInput, settings: RequestSettings): BuiltRequest {
  // 現在ページより後ろで聞いた問いは、先の内容を含みうるので送らない
  const past = input.pastQuestions.filter((q) => q.page <= input.page).slice(0, PAST_QUESTIONS_LIMIT)
  const parts: string[] = [
    `# 本\n書名：${input.bookTitle}\n章：${input.chapter || '（不明）'}\n節：${input.section || '（不明）'}\n現在のページ：${input.page}`,
    `# なぞった一節\n${input.passageText}`,
    `# 一節を含む文（前後の文を添える）\n${input.surrounding || '（取れませんでした）'}`,
    `# このページの文字（${input.page}ページ）\n${input.pageText}`,
  ]
  if (past.length) {
    parts.push(
      `# 同じ章で以前に聞いたこと（新しい順）\n` +
        past.map((q) => `- p.${q.page}「${q.question}」→ ${q.answerSpeech}`).join('\n'),
    )
  }
  parts.push(`# 質問\n${input.question}`)

  const content: (TextBlock | ImageBlock)[] = []
  if (input.passageImage) {
    content.push({ type: 'text', text: 'なぞった範囲の画像（数式などは文字より画像が正確）：' })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: input.passageImage } })
  }
  content.push({ type: 'text', text: parts.join('\n\n') })

  return {
    model: settings.model,
    max_tokens: settings.maxTokens,
    system: ASK_SYSTEM,
    effort: settings.effort,
    messages: [{ role: 'user', content }],
  }
}

export interface GapInput {
  bookTitle: string
  section: string
  /** 節の本文（節の最初のページから現在ページまで） */
  sectionText: string
  summary: string
}

export function buildGapRequest(input: GapInput, settings: RequestSettings): BuiltRequest {
  return {
    model: settings.model,
    max_tokens: settings.maxTokens,
    system: GAP_SYSTEM,
    effort: settings.effort,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `# 本\n${input.bookTitle}\n\n# 節\n${input.section}\n\n# 節の本文\n${input.sectionText}\n\n# 読み手のまとめ（書き直さないこと）\n${input.summary}`,
          },
        ],
      },
    ],
  }
}
