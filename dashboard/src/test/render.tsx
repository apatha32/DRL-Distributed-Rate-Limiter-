import { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DemoProvider } from '../components/DemoProvider'
import { AdminKeyProvider, ToastProvider } from '../components/Providers'

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AdminKeyProvider>
            <DemoProvider>{ui}</DemoProvider>
          </AdminKeyProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
