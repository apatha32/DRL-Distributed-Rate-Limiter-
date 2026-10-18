import { lazy, ReactNode, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import { PageSkeleton } from './components/ui'
import { ease } from './lib/theme'

const Overview = lazy(() => import('./pages/Overview'))
const Playground = lazy(() => import('./pages/Playground'))
const Agent = lazy(() => import('./pages/Agent'))
const Algorithms = lazy(() => import('./pages/Algorithms'))
const Analyst = lazy(() => import('./pages/Analyst'))
const NotFound = lazy(() => import('./pages/NotFound'))

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease } }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.18, ease } }}
    >
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </ErrorBoundary>
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Page><Overview /></Page>} />
          <Route path="/playground" element={<Page><Playground /></Page>} />
          <Route path="/agent" element={<Page><Agent /></Page>} />
          <Route path="/algorithms" element={<Page><Algorithms /></Page>} />
          <Route path="/analyst" element={<Page><Analyst /></Page>} />
          <Route path="*" element={<Page><NotFound /></Page>} />
        </Routes>
      </AnimatePresence>
    </Layout>
  )
}
