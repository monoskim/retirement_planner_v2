import { useState, useEffect } from 'react'
import { getScenarios, runSimulation, runMonteCarlo } from '../api'
import { formatCurrency } from '../components/shared'
import {
  ComposedChart, AreaChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

export default function Simulator() {
  const [scenarios, setScenarios] = useState([])
  const [scenarioId, setScenarioId] = useState('base')
  const [results, setResults] = useState(null)
  const [mcResults, setMcResults] = useState(null)
  const [tab, setTab] = useState('portfolio')
  const [running, setRunning] = useState(false)
  const [runningMc, setRunningMc] = useState(false)
  const [error, setError] = useState('')
  const [nSim, setNSim] = useState(3000)

  useEffect(() => {
    getScenarios().then(s => { setScenarios(s); if (s.length > 0) setScenarioId(s.find(x => x.is_base)?.id ?? s[0].id) })
  }, [])

  const run = async () => {
    setRunning(true); setError(''); setMcResults(null)
    try {
      const res = await runSimulation(scenarioId)
      setResults(res.projection)
    } catch (err) {
      setError(err.response?.data?.detail || 'Simulation failed — ensure profile, accounts, and income are configured.')
    }
    setRunning(false)
  }

  const runMC = async () => {
    setRunningMc(true); setError('')
    try {
      const res = await runMonteCarlo(scenarioId, { n_simulations: nSim })
      setMcResults(res)
    } catch (err) {
      setError(err.response?.data?.detail || 'Monte Carlo failed')
    }
    setRunningMc(false)
  }

  const mcChartData = mcResults?.percentiles_by_year?.map(r => ({
    age: r.age, p10: r.p10, p25: r.p25, p50: r.p50, p75: r.p75, p90: r.p90,
  }))

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
            <option value="base">— Base Plan —</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-primary" onClick={run} disabled={running}>
            {running ? 'Running…' : '▶ Run Simulation'}
          </button>
          <button className="btn-secondary" onClick={runMC} disabled={runningMc || !results}>
            {runningMc ? 'Running MC…' : '🎲 Monte Carlo'}
          </button>
          <input type="number" value={nSim} onChange={e => setNSim(+e.target.value)} min={100} max={10000} style={{ width: 80, fontSize: 13 }} title="Simulations" />
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
            {mcResults && (
              <div className="stat-card">
                <div className="stat-label">MC Success Rate</div>
                <div className={`stat-value ${mcResults.success_rate >= 90 ? 'green' : mcResults.success_rate >= 70 ? 'yellow' : 'red'}`}>
                  {mcResults.success_rate.toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          <div className="tab-group" style={{ marginBottom: 12 }}>
            {['portfolio','income/expenses','table','monte carlo'].map(t => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {tab === 'portfolio' && (
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Net Worth Projection</h3>
              <div className="chart-container" style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
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
              </div>
            </div>
          )}

          {tab === 'income/expenses' && (
            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Annual Income vs Expenses vs Taxes</h3>
              <div className="chart-container" style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
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
              </div>
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

          {tab === 'monte carlo' && (
            <div className="card">
              {!mcResults
                ? <div className="empty-state"><p>Click "🎲 Monte Carlo" above to run {nSim.toLocaleString()} simulations.</p></div>
                : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 13 }}>Success Rate (never runs out): </span>
                      <strong style={{ color: mcResults.success_rate >= 90 ? 'var(--green)' : mcResults.success_rate >= 70 ? 'var(--yellow)' : 'var(--red)', fontSize: 16 }}>
                        {mcResults.success_rate.toFixed(1)}%
                      </strong>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>({nSim.toLocaleString()} simulations)</span>
                    </div>
                    <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Portfolio Percentile Fan Chart</h3>
                    <div className="chart-container" style={{ height: 340 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={mcChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                          <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                          <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="p90" name="90th pct" stroke="#22c55e" fill="rgba(34,197,94,0.06)" strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="p75" name="75th pct" stroke="#4f8ef7" fill="rgba(79,142,247,0.08)" strokeWidth={1.5} dot={false} />
                          <Line type="monotone" dataKey="p50" name="Median" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                          <Area type="monotone" dataKey="p25" name="25th pct" stroke="#a78bfa" fill="rgba(167,139,250,0.06)" strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="p10" name="10th pct" stroke="#ef4444" fill="rgba(239,68,68,0.06)" strokeWidth={1.5} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
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
