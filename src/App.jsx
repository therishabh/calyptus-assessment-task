import { useEffect, useMemo, useState } from 'react'

const STATUS_STYLES = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  refunded: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  chargeback: 'bg-orange-100 text-orange-800',
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

function App() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

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

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return orders
    return orders.filter(
      (order) =>
        order.customer?.name?.toLowerCase().includes(term) ||
        order.customer?.email?.toLowerCase().includes(term),
    )
  }, [orders, query])

  if (loading) return <p className="p-6 text-gray-500">Loading orders…</p>
  if (error) return <p role="alert" className="p-6 text-red-600">Could not load orders: {error}</p>

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer name or email"
          aria-label="Search orders by customer name or email"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-80"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date &amp; Time</th>
              <th className="px-4 py-3 text-right">Items</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  {query.trim() ? 'No orders match your search' : 'No orders found'}
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
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
