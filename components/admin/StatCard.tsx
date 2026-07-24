import styles from './admin.module.css'

export function StatCard({ label }: { label: string }) {
  return <article className={styles.statCard}><p>{label}</p><strong>—</strong><span>Placeholder data</span></article>
}
