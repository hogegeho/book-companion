import './App.css'

// 段1 の土台：左に本、右に AI の帯を並べる枠だけ置く。中身は段2以降。
export default function App() {
  return (
    <div className="layout">
      <main className="book" aria-label="本">
        <p className="placeholder">PDFを開くと、ここに本が表示されます。</p>
      </main>
      <aside className="ai-strip" aria-label="AIの帯">
        <h1 className="app-title">Book Companion</h1>
        <p className="placeholder">なぞった一節への答えがここに出ます。</p>
      </aside>
    </div>
  )
}
