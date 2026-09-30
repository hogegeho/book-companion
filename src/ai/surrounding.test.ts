import { expect, test } from 'vitest'
import { surroundingSentences } from './surrounding.ts'

const PAGE = `When you return to a passage you questioned before, the old question is a map. It
shows where you were confused and what resolved the confusion. Keeping those
questions next to the text turns a single reading into a record you can revisit.
The end of a section is a natural place to stop and check.`

test('一節を含む文と前後1文を返す（行の折り返しはまたぐ）', () => {
  expect(surroundingSentences(PAGE, 'what resolved the confusion.')).toBe(
    'When you return to a passage you questioned before, the old question is a map. It shows where you were confused and what resolved the confusion. Keeping those questions next to the text turns a single reading into a record you can revisit.',
  )
})

test('一節の中の空白・改行の違いは無視して見つける', () => {
  expect(surroundingSentences(PAGE, 'Keeping those questions   next to', 0)).toBe(
    'Keeping those questions next to the text turns a single reading into a record you can revisit.',
  )
})

test('和文でも文に分ける', () => {
  const ja = '本をゆっくり読む人は、時間を無駄にしていない。一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。合わないところで理解が変わる。'
  expect(surroundingSentences(ja, '小さな主張', 0)).toBe('一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。')
})

test('見つからなければ空', () => {
  expect(surroundingSentences(PAGE, 'not on this page')).toBe('')
})
