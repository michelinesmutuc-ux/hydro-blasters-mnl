'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { requireAdminSession } from '../../lib/admin/auth'
import styles from './admin.module.css'

type RecentOrder = { id: string; order_reference: string; customer_name: string; overall_total: number | string; created_at: string }

export function RecentOrders() {
  const [orders, setOrders] = useState<RecentOrder[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        await requireAdminSession()
        const { data, error: queryError } = await supabase.from('orders').select('id,order_reference,customer_name,overall_total,created_at').is('archived_at', null).order('created_at', { ascending: false }).limit(5)
        if (queryError) throw queryError
        setOrders((data ?? []) as RecentOrder[])
      } catch { setError(true) }
    })()
  }, [])

  if (error) return <p className={styles.emptyState}>Recent orders could not be loaded.</p>
  if (!orders.length) return <p className={styles.emptyState}>No orders yet.</p>
  return <div className={styles.recentOrders}>{orders.map((order) => <Link key={order.id} href={`/admin/order?orderId=${encodeURIComponent(order.id)}`}><span><strong>{order.order_reference}</strong><small>{order.customer_name} · {new Date(order.created_at).toLocaleDateString('en-PH')}</small></span><b>View Order →</b></Link>)}</div>
}
