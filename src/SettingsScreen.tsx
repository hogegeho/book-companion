import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AiSettings, type Effort } from './settings.ts'

/** 設定（API キー・モデル・上限）。キーは端末の中だけに置き、書き出しに含めない */
export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AiSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    void loadSettings().then(setS)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (patch: Partial<AiSettings>) => {
    setS((cur) => (cur ? { ...cur, ...patch } : cur))
    setSaved(false)
  }

  return (
    <div className="screen" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="screen-header">
        <h2 id="settings-title">設定</h2>
        <button type="button" onClick={onClose}>
          閉じる
        </button>
      </header>
      <div className="screen-body">
        {s && (
          <form
            className="settings-form"
            onSubmit={async (e) => {
              e.preventDefault()
              await saveSettings({ ...s, apiKey: s.apiKey.trim(), model: s.model.trim() || DEFAULT_SETTINGS.model })
              setSaved(true)
            }}
          >
            <label>
              API キー
              <span className="key-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={s.apiKey}
                  placeholder="sk-ant-…"
                  onChange={(e) => set({ apiKey: e.target.value })}
                />
                <button type="button" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? '隠す' : '見る'}
                </button>
              </span>
              <small>この端末の中だけに保存します。書き出しには含めません。使用量の上限は Anthropic Console で設定してください。</small>
            </label>
            <label>
              モデル
              <input value={s.model} spellCheck={false} onChange={(e) => set({ model: e.target.value })} />
              <small>既定は {DEFAULT_SETTINGS.model}。安くしたいときは claude-sonnet-5-5 や claude-haiku-4-5 など。</small>
            </label>
            <label>
              1回あたりの上限（max_tokens）
              <input
                type="number"
                min={256}
                max={64000}
                step={256}
                value={s.maxTokens}
                onChange={(e) => set({ maxTokens: Number(e.target.value) || DEFAULT_SETTINGS.maxTokens })}
              />
              <small>考える分も含みます。小さすぎると答えが途中で切れます。</small>
            </label>
            <label>
              考える深さ（effort）
              <select value={s.effort} onChange={(e) => set({ effort: e.target.value as Effort })}>
                <option value="low">low（速い・安い）</option>
                <option value="medium">medium</option>
                <option value="high">high（じっくり）</option>
              </select>
            </label>
            <p>
              <button type="submit">保存</button> <span role="status">{saved ? '保存しました' : ''}</span>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
