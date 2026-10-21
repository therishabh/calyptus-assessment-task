import { useEffect, useMemo, useState } from 'react'

const REQUEST_TIMEOUT_MS = 10000
const SLOW_NOTICE_MS = 3000

class LoadError extends Error {}

// Lets the error UI be previewed without breaking the real endpoint:
//   ?error=1 (or network), 404, 500, json, shape, timeout
const requestOrders = (signal) => {
  const forced = new URLSearchParams(window.location.search).get('error')
  switch (forced) {
    case null:
      return fetch('/orders.json', { signal })
    case '404':
      return Promise.resolve(new Response('Not Found', { status: 404, statusText: 'Not Found' }))
    case '500':
      return Promise.resolve(new Response('Oops', { status: 500, statusText: 'Internal Server Error' }))
    case 'json':
      return Promise.resolve(new Response('<html>not json</html>'))
    case 'shape':
      return Promise.resolve(new Response('{}'))
    case 'timeout':
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    default:
      return Promise.reject(new TypeError('Failed to fetch'))
  }
}

const STATUS_STYLES = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  refunded: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  chargeback: 'bg-orange-100 text-orange-800',
}

const SORT_VALUES = {
  total: (order) => {
    if (order.total === null || order.total === undefined || order.total === '') return null
    const n = Number(order.total)
    return Number.isNaN(n) ? null : n
  },
  date: (order) => {
    const t = new Date(order.created_at).getTime()
    return Number.isNaN(t) ? null : t
  },
}

// Sums in minor units (cents) so float rounding doesn't leak into the totals
const paidTotalsByCurrency = (orders) => {
  const groups = {}
  for (const order of orders) {
    if (order.status !== 'paid') continue
    const amount = SORT_VALUES.total(order)
    if (amount === null) continue
    const group = (groups[order.currency] ??= { cents: 0, count: 0 })
    group.cents += Math.round(amount * 100)
    group.count += 1
  }
  return Object.entries(groups)
    .map(([currency, { cents, count }]) => ({ currency, total: cents / 100, count }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

const formatTotal = (total, currency) => {
  if (total === null || total === undefined || total === '') return '—'
  const amount = Number(total)
  if (Number.isNaN(amount)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}

const formatDateTime = (iso) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function LoadingSkeleton({ slow }) {
  return (
    <div className="mx-auto max-w-6xl p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading orders…</span>
      <div className="mb-6 h-24 animate-pulse rounded-lg bg-gray-200" />
      <div className="mb-4 h-10 animate-pulse rounded-lg bg-gray-200" />
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
        ))}
      </div>
      {slow && (
        <p className="mt-4 text-center text-sm text-gray-500">
          This is taking longer than usual. Your connection may be slow…
        </p>
      )}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p className="font-semibold">Could not load orders</p>
        <p className="mt-1 text-sm">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

function SortButton({ label, active, dir, onClick, align }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-gray-900 ${
        align === 'right' ? 'flex-row-reverse' : ''
      } ${active ? 'text-gray-900' : ''}`}
    >
      {label}
      <span aria-hidden="true" className={active ? '' : 'text-gray-300'}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )
}

function App() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [skipped, setSkipped] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])

    requestOrders(signal)
      .then(async (res) => {
        if (!res.ok) throw new LoadError(`The server responded with ${res.status} ${res.statusText}`.trim())
        try {
          return await res.json()
        } catch {
          throw new LoadError('The response is not valid JSON')
        }
      })
      .then((data) => {
        if (!Array.isArray(data?.orders)) {
          throw new LoadError('The response is missing an "orders" list')
        }
        const valid = data.orders.filter((o) => o && typeof o === 'object' && o.id)
        setOrders(valid)
        setSkipped(data.orders.length - valid.length)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (err.name === 'TimeoutError') {
          setError(`The request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`)
        } else if (err instanceof LoadError) {
          setError(err.message)
        } else {
          setError('Network error: could not reach the server. Check your connection.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [loading, attempt])

  const retry = () => {
    setError(null)
    setSlow(false)
    setLoading(true)
    setAttempt((n) => n + 1)
  }

  const statuses = useMemo(() => [...new Set(orders.map((o) => o.status))].sort(), [orders])

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase()
    return orders.filter((order) => {
      if (status !== 'all' && order.status !== status) return false
      if (!term) return true
      return (
        order.customer?.name?.toLowerCase().includes(term) ||
        order.customer?.email?.toLowerCase().includes(term)
      )
    })
  }, [orders, query, status])

  const paidTotals = useMemo(() => paidTotalsByCurrency(orders), [orders])

  const sortedOrders = useMemo(() => {
    if (!sort.key) return filteredOrders
    const getValue = SORT_VALUES[sort.key]
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...filteredOrders].sort((a, b) => {
      const va = getValue(a)
      const vb = getValue(b)
      // Missing values always go last, whichever direction is active
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return (va - vb) * factor
    })
  }, [filteredOrders, sort])

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key !== key ? { key, dir: 'asc' } : { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' },
    )

  const ariaSort = (key) =>
    sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'

  const isFiltering = query.trim() !== '' || status !== 'all'

  if (loading) return <LoadingSkeleton slow={slow} />
  if (error) return <ErrorState message={error} onRetry={retry} />

  return (
    <div className="mx-auto max-w-6xl p-6">
      {skipped > 0 && (
        <p role="alert" className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          {skipped} {skipped === 1 ? 'order was' : 'orders were'} skipped because the data was malformed.
        </p>
      )}
      <section aria-labelledby="paid-summary-heading" className="mb-6">
        <h2 id="paid-summary-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          Paid orders total
        </h2>
        {paidTotals.length === 0 ? (
          <p className="text-sm text-gray-500">No paid orders</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paidTotals.map(({ currency, total, count }) => (
              <div key={currency} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">{currency}</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">
                  {formatTotal(total, currency)}
                </p>
                <p className="text-xs text-gray-500">
                  {count} paid {count === 1 ? 'order' : 'orders'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter orders by status"
            className="rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm capitalize shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer name or email"
            aria-label="Search orders by customer name or email"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-0 flex-1 sm:w-80 sm:flex-none"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right" aria-sort={ariaSort('total')}>
                <SortButton label="Total" active={sort.key === 'total'} dir={sort.dir} onClick={() => toggleSort('total')} align="right" />
              </th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" aria-sort={ariaSort('date')}>
                <SortButton label="Date &amp; Time" active={sort.key === 'date'} dir={sort.dir} onClick={() => toggleSort('date')} />
              </th>
              <th className="px-4 py-3 text-right">Items</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  {isFiltering ? 'No orders match your filters' : 'No orders found'}
                </td>
              </tr>
            ) : (
              sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{order.id}</td>
                  <td className="max-w-xs break-words px-4 py-3">{order.customer?.name || '—'}</td>
                  <td className="max-w-xs break-all px-4 py-3">{order.customer?.email || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatTotal(order.total, order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(order.created_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{order.items}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App
