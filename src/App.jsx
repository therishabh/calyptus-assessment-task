import { useEffect, useMemo, useState } from 'react'

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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/orders.json', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        return res.json()
      })
      .then((data) => setOrders(data.orders ?? []))
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

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

  if (loading) return <p className="p-6 text-gray-500">Loading orders…</p>
  if (error) return <p role="alert" className="p-6 text-red-600">Could not load orders: {error}</p>

  return (
    <div className="mx-auto max-w-6xl p-6">
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
