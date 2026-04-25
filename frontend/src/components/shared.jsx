const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = v => `${v?.toFixed(1) ?? '0.0'}%`

export const formatCurrency = v => fmt.format(v ?? 0)
export const formatPct = fmtPct

export function FormField({ label, children, fullWidth }) {
  return (
    <div className={`form-group${fullWidth ? ' full-width' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner() {
  return <div className="loading">Loading…</div>
}

export function EmptyState({ icon = '📭', title, subtitle, action }) {
  return (
    <div className="empty-state">
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <h3>{title}</h3>
      {subtitle && <p style={{ marginBottom: 16 }}>{subtitle}</p>}
      {action}
    </div>
  )
}
