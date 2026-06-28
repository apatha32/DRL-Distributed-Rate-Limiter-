import React, { useState } from 'react'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Algorithms from './pages/Algorithms'
import MetricsDetail from './pages/MetricsDetail'
import Demo from './pages/Demo'
import AIAgent from './pages/AIAgent'

type Page = 'dashboard' | 'algorithms' | 'metrics' | 'demo' | 'ai'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [isDark, setIsDark] = useState(true)

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} isDark={isDark} setIsDark={setIsDark} />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {currentPage === 'dashboard' && <Dashboard />}
          {currentPage === 'algorithms' && <Algorithms />}
          {currentPage === 'metrics' && <MetricsDetail />}
          {currentPage === 'demo' && <Demo />}
          {currentPage === 'ai' && <AIAgent />}
        </main>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-700 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-4 gradient-text">DRL Dashboard</h3>
                <p className="text-slate-400 text-sm">Professional monitoring for distributed rate limiting.</p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Features</h4>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li><a href="#" className="hover:text-cyan-400 transition">Real-time Metrics</a></li>
                  <li><a href="#" className="hover:text-cyan-400 transition">Algorithm Visualization</a></li>
                  <li><a href="#" className="hover:text-cyan-400 transition">Performance Monitoring</a></li>
                  <li><a href="#" className="hover:text-cyan-400 transition">AI Adaptive Agent</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Resources</h4>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li><a href="#" className="hover:text-cyan-400 transition">Documentation</a></li>
                  <li><a href="#" className="hover:text-cyan-400 transition">GitHub</a></li>
                  <li><a href="#" className="hover:text-cyan-400 transition">Support</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-slate-700 mt-8 pt-8 text-center text-slate-500 text-sm">
              <p>&copy; 2024 Distributed Rate Limiter. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
