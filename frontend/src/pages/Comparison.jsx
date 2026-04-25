import { useState, useEffect } from 'react'
import { getScenarios, compareScenarios } from '../api'
import { formatCurrency } from '../components/shared'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = ['#4f8ef7','#22c55e','#f59e0b','#ef4444','#a78bfa','#06b6d4']

export default function Comparison() {
  const [scenarios, setScenarios] = useState([])
  const [selected, setSelected] = useState([])
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [metric, setMetric] = useState('total_net_worth')

  useEffect(() => { getScenarios().then(setScenarios) }, [])

  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const run = async () => {
    if (selected.length < 2) { setError('Select at least 2 scenarios to compare.'); return }
    setRunning(true); setError('')
    try {
      const res = await compareScenarios(selected)
      setResults(res)
    } catch (err) {
      setError(err.response?.data?.detail || 'Comparison failed')
    }
    setRunning(false)
  }

  const METRICS = [
    { key: 'total_net_worth', label: 'Net Worth' },
    { key: 'liquid_portfolio', label: 'Liquid Portfolio' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'taxes', label: 'Taxes' },
    { key: 'cash_surplus_deficit', label: 'Cash Surplus/Deficit' },
  ]

  // Build chart data from results: array of { age, [scenarioName]: value }
  let chartData = []
  if (results) {
    const allAges = [...new Set(Object.values(results).flatMap(proj => proj.map(r => r.age)))].sort((a, b) => a - b)
    chartData = allAges.map(age => {
      const row = { age }
      Object.entries(results).forEach(([sid, proj]) => {
        const sc = scenarios.find(s => String(s.id) === String(sid))
        const name = sc?.name ?? sid
        const yr = proj.find(r => r.age === age)
        row[name] = yr?.[metric] ?? null
      })
      return row
    })
  }

  const scenarioNames = results ? Object.keys(results).map(sid => scenarios.find(s => String(s.id) === String(sid))?.name ?? sid) : []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Scenario Comparison</h1>
          <p className="page-subtitle">Compare projections across multiple scenarios</p>
        </div>
        <button className="btn-primary" onClick={run} disabled={running || selected.length < 2}>
          {running ? 'Running…' : '⚖️ Compare'}
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Scenario selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Select Scenarios (pick 2+)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {scenarios.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No scenarios found. Create some in the Scenarios page.</span>}
          {scenarios.map(s => (
            <div key={s.id} onClick={() => toggle(s.id)}
              style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: selected.includes(s.id) ? 'var(--accent)' : 'var(--surface2)',
                color: selected.includes(s.id) ? '#fff' : 'var(--text)',
                border: `1px solid ${selected.includes(s.id) ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {s.name}{s.is_base ? ' (base)' : ''}
            </div>
          ))}
        </div>
      </div>

      {results && (
        <>
          {/* Metric selector */}
          <div className="tab-group" style={{ marginBottom: 12 }}>
            {METRICS.map(m => (
              <button key={m.key} className={`tab${metric === m.key ? ' active' : ''}`} onClick={() => setMetric(m.key)}>{m.label}</button>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chart-container" style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {scenarioNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary table */}
          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Final Year Comparison</h3>
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Final Net Worth</th>
                  <th>Peak Net Worth</th>
                  <th>Final Income</th>
                  <th>Final Expenses</th>
                  <th>Years Solvent</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(results).map(([sid, proj]) => {
                  const sc = scenarios.find(s => String(s.id) === String(sid))
                  return (
                    <tr key={sid}>
                      <td style={{ fontWeight: 500 }}>{sc?.name ?? sid}</td>
                      <td style={{ color: proj.at(-1)?.total_net_worth >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatCurrency(proj.at(-1)?.total_net_worth)}
                      </td>
                      <td>{formatCurrency(Math.max(...proj.map(r => r.total_net_worth)))}</td>
                      <td style={{ color: 'var(--green)' }}>{formatCurrency(proj.at(-1)?.income)}</td>
                      <td>{formatCurrency(proj.at(-1)?.expenses)}</td>
                      <td>{proj.filter(r => r.is_solvent).length}/{proj.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!results && !running && (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚖️</div>
            <h3>No Comparison Yet</h3>
            <p>Select 2 or more scenarios above and click Compare.</p>
          </div>
        </div>
      )}
    </div>
  )
}
