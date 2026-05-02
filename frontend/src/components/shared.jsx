import { useLayoutEffect, useRef, useState } from 'react'

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

export function MeasuredChart({ height, style, children }) {
  const containerRef = useRef(null)
  const [isReady, setIsReady] = useState(false)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return undefined

    const updateReady = () => {
      const { width, height: measuredHeight } = element.getBoundingClientRect()
      setIsReady(width > 0 && measuredHeight > 0)
    }

    updateReady()

    const observer = new ResizeObserver(() => updateReady())
    observer.observe(element)

    return () => observer.disconnect()
  }, [height])

  return (
    <div ref={containerRef} className="chart-container" style={{ height, ...style }}>
      {isReady ? children : null}
    </div>
  )
}
