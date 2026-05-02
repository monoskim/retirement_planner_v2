import { useState, useEffect } from 'react'
import { getScenarios, runSimulation } from '../api'
import { formatCurrency, MeasuredChart } from '../components/shared'
import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const normalizeProjection = projection =>
  (projection ?? []).map(row => ({
    ...row,
    income: typeof row.income === 'number' ? row.income : row.income?.total ?? 0,
    expenses: typeof row.expenses === 'number' ? row.expenses : row.expenses?.total ?? 0,
    taxes: typeof row.taxes === 'number' ? row.taxes : row.taxes?.total ?? 0,
    withdrawals: typeof row.withdrawals === 'number' ? row.withdrawals : row.withdrawals?.total ?? 0,
  }))

export default function Simulator() {
  const [scenarios, setScenarios] = useState([])
  const [scenarioId, setScenarioId] = useState('base')
  const [results, setResults] = useState(null)
  const [chartsReady, setChartsReady] = useState(false)
  const [tab, setTab] = useState('portfolio')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const scenarioOptions = scenarios.length > 0 ? scenarios : [{ id: 'base', name: 'Base Plan', is_base: true }]

  useEffect(() => {
    getScenarios().then(s => {
      setScenarios(s)
      if (s.length > 0) {
        setScenarioId(s.find(x => x.is_base)?.id ?? s[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!results) {
      setChartsReady(false)
      return undefined
    }

    const frameId = requestAnimationFrame(() => setChartsReady(true))
    return () => cancelAnimationFrame(frameId)
  }, [results, tab])

  const run = async () => {
    setRunning(true); setError(''); setChartsReady(false)
    try {
      const res = await runSimulation(scenarioId)
      setResults(normalizeProjection(res.results ?? res.projection))
    } catch (err) {
      setError(err.response?.data?.detail || 'Simulation failed — ensure profile, accounts, and income are configured.')
    }
    setRunning(false)
  }

  const retirementAge = results?.find(r => r.is_working === false)?.age

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Simulator</h1>
          <p className="page-subtitle">Year-by-year projection with optional Monte Carlo analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={scenarioId} onChange={e => setScenarioId(e.target.value)} style={{ fontSize: 13 }}>
            {scenarioOptions.map(s => <option key={s.id} value={s.id}>{s.is_base ? 'Base Plan' : s.name}</option>)}
          </select>
          <button className="btn-primary" onClick={run} disabled={running}>
            {running ? 'Running…' : '▶ Run Simulation'}
          </button>

        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {results && (
        <>
          {/* Summary stats */}
          <div className="stats-row" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-label">Peak Net Worth</div>
              <div className="stat-value accent">{formatCurrency(Math.max(...results.map(r => r.total_net_worth)))}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Final Net Worth</div>
              <div className={`stat-value ${results.at(-1)?.total_net_worth >= 0 ? 'green' : 'red'}`}>
                {formatCurrency(results.at(-1)?.total_net_worth)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Years Solvent</div>
              <div className="stat-value">{results.filter(r => r.is_solvent).length} / {results.length}</div>
            </div>

          </div>

          <div className="tab-group" style={{ marginBottom: 12 }}>
            {['portfolio','income/expenses','table'].map(t => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {tab === 'portfolio' && (
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Net Worth Projection</h3>
              <MeasuredChart height={340}>
                {!chartsReady ? null : (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={340}>
                  <ComposedChart data={results}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {retirementAge && <ReferenceLine x={retirementAge} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: 'Retire', fill: 'var(--accent)', fontSize: 11 }} />}
                    <Area type="monotone" dataKey="total_net_worth" name="Total Net Worth" stroke="#4f8ef7" fill="rgba(79,142,247,0.12)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="liquid_portfolio" name="Liquid Portfolio" stroke="#22c55e" fill="rgba(34,197,94,0.08)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="real_estate_equity" name="RE Equity" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                )}
              </MeasuredChart>
            </div>
          )}

          {tab === 'income/expenses' && (
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Annual Income vs Expenses vs Taxes</h3>
              <MeasuredChart height={340}>
                {!chartsReady ? null : (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={340}>
                  <ComposedChart data={results}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {retirementAge && <ReferenceLine x={retirementAge} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: 'Retire', fill: 'var(--accent)', fontSize: 11 }} />}
                    <Bar dataKey="income" name="Income" fill="#22c55e" opacity={0.8} />
                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" opacity={0.8} />
                    <Line type="monotone" dataKey="taxes" name="Taxes" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cash_surplus_deficit" name="Cash Surplus/Deficit" stroke="#a78bfa" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                )}
              </MeasuredChart>
            </div>
          )}

          {tab === 'table' && (
            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Year</th><th>Age</th><th>Net Worth</th><th>Liquid</th><th>RE Equity</th>
                      <th>Income</th><th>Expenses</th><th>Taxes</th><th>Withdrawals</th><th>Surplus</th><th>Solvent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ background: !r.is_solvent ? 'rgba(239,68,68,0.08)' : r.age === retirementAge ? 'rgba(79,142,247,0.06)' : '' }}>
                        <td>{r.year}</td>
                        <td>{r.age}</td>
                        <td style={{ color: r.total_net_worth < 0 ? 'var(--red)' : '' }}>{formatCurrency(r.total_net_worth)}</td>
                        <td>{formatCurrency(r.liquid_portfolio)}</td>
                        <td>{formatCurrency(r.real_estate_equity)}</td>
                        <td style={{ color: 'var(--green)' }}>{formatCurrency(r.income)}</td>
                        <td style={{ color: 'var(--red)' }}>{formatCurrency(r.expenses)}</td>
                        <td>{formatCurrency(r.taxes)}</td>
                        <td>{formatCurrency(r.withdrawals)}</td>
                        <td style={{ color: r.cash_surplus_deficit >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(r.cash_surplus_deficit)}</td>
                        <td>{r.is_solvent ? '✓' : '⚠'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


        </>
      )}

      {!results && !running && !error && (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3>Ready to Simulate</h3>
            <p>Select a scenario and click Run Simulation to generate your projection.</p>
          </div>
        </div>
      )}
    </div>
  )
}
