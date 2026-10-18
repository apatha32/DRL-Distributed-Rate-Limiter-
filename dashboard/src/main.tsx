import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import App from './App'
import { DemoProvider } from './components/DemoProvider'
import { AdminKeyProvider, ToastProvider } from './components/Providers'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000, refetchOnWindowFocus: true },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Honors the OS "reduce motion" setting for every animation */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <AdminKeyProvider>
              <DemoProvider>
                <App />
              </DemoProvider>
            </AdminKeyProvider>
          </ToastProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
