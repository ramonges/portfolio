import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { SearchPage } from './pages/SearchPage'
import { PortfolioPage } from './pages/PortfolioPage'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-900">
        <header className="fixed top-0 left-0 right-0 h-14 z-30 flex items-center px-6 bg-slate-900/80 border-b border-slate-800">
          <h1 className="text-xl font-bold text-emerald-400">Opti Portfolio 26</h1>
        </header>
        <main className="pt-14">
          <Sidebar />
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
