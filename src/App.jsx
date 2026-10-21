import { useEffect, useState } from 'react'
import './App.css'

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

  if (loading) return <p>Loading orders…</p>
  if (error) return <p role="alert">Could not load orders: {error}</p>

  return (
    <table className="orders-table">
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Email</th>
          <th>Total</th>
          <th>Status</th>
          <th>Date &amp; Time</th>
          <th>Items</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 ? (
          <tr>
            <td colSpan={7}>No orders found</td>
          </tr>
        ) : (
          orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.customer?.name || '—'}</td>
              <td>{order.customer?.email || '—'}</td>
              <td>{formatTotal(order.total, order.currency)}</td>
              <td>{order.status}</td>
              <td>{formatDateTime(order.created_at)}</td>
              <td>{order.items}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

export default App
