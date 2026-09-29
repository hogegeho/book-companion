import { useEffect, useState } from 'react'
import { CHANGELOG } from './changelog.ts'
import { checkForUpdate, type UpdateCheck } from './pwa.ts'
import { APP_VERSION, BUILD_TIME, GIT_SHA, fetchLatestVersion, versionLabel } from './version.ts'

const CHECK_MESSAGES: Record<UpdateCheck, string> = {
  updating: '新しい版を読み込んでいます。まもなく読み込み直します。',
  latest: 'この端末の版が最新です。',
  offline: '通信できないため確かめられませんでした。',
  unavailable: 'この環境では更新を確かめられません。',
}

/** 変更履歴の画面（全面に重ねる） */
export function ChangelogScreen({ onClose }: { onClose: () => void }) {
  const [latest, setLatest] = useState<Awaited<ReturnType<typeof fetchLatestVersion>> | undefined>(undefined)
  const [check, setCheck] = useState<UpdateCheck | 'checking' | null>(null)

  useEffect(() => {
    let alive = true
    void fetchLatestVersion().then((v) => alive && setLatest(v))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const behind = latest && latest.version !== APP_VERSION

  return (
    <div className="screen" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <header className="screen-header">
        <h2 id="changelog-title">変更履歴</h2>
        <button type="button" onClick={onClose} autoFocus>
          閉じる
        </button>
      </header>
      <div className="screen-body">
        <section className="version-box" aria-label="版">
          <p>
            この端末の版：<strong data-testid="running-version">{versionLabel()}</strong>
            <small>（{new Date(BUILD_TIME).toLocaleString('ja-JP')} に作成）</small>
          </p>
          <p>
            公開中の最新版：
            <strong data-testid="latest-version">
              {latest === undefined ? '確認中…' : latest ? versionLabel(latest.version, latest.sha) : '取得できませんでした'}
            </strong>
            {behind && <span className="badge">新しい版があります</span>}
          </p>
          <p>
            <button
              type="button"
              disabled={check === 'checking'}
              onClick={async () => {
                setCheck('checking')
                setCheck(await checkForUpdate())
              }}
            >
              更新を確認
            </button>{' '}
            <span role="status">{check === 'checking' ? '確認しています…' : check ? CHECK_MESSAGES[check] : ''}</span>
          </p>
        </section>
        <ol className="changelog">
          {CHANGELOG.map((e) => (
            <li key={e.version} className={e.version === APP_VERSION ? 'current' : undefined}>
              <h3>
                v{e.version} <small>{e.date}</small>
                {e.version === APP_VERSION && <span className="badge">この端末</span>}
              </h3>
              <ul>
                {e.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="placeholder">ビルド {GIT_SHA}</p>
      </div>
    </div>
  )
}
