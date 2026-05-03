import { useState, useEffect } from 'react'
import { getScenarios, runSimulation, runMonteCarlo } from '../api'
import { formatCurrency, formatPct, MeasuredChart } from '../components/shared'
import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const normalizeProjection = projection =>
  (projection ?? []).map(row => {
    const incomeTotal = typeof row.income === 'number' ? row.income : row.income?.total ?? 0
    const expensesTotal = typeof row.expenses === 'number' ? row.expenses : row.expenses?.total ?? 0
    const taxesTotal = typeof row.taxes === 'number' ? row.taxes : row.taxes?.total ?? 0
    const withdrawalsTotal = typeof row.withdrawals === 'number' ? row.withdrawals : row.withdrawals?.total ?? 0

    return {
      ...row,
      income: incomeTotal,
      _income_detail: typeof row.income === 'object' ? row.income : null,
      expenses: expensesTotal,
      _expenses_detail: typeof row.expenses === 'object' ? row.expenses : null,
      taxes: taxesTotal,
      _taxes_detail: typeof row.taxes === 'object' ? row.taxes : null,
      withdrawals: withdrawalsTotal,
      _withdrawals_detail: typeof row.withdrawals === 'object' ? row.withdrawals : null,
      _surplus_detail: {
        income_inflow: incomeTotal,
        withdrawals_inflow: withdrawalsTotal,
        expenses_outflow: -expensesTotal,
        taxes_outflow: -taxesTotal,
        total: row.cash_surplus_deficit ?? 0,
      },
    }
  })

const DEFAULT_MC_PARAMS = {
  n_simulations: 3000,
  return_mean_override: '',
  return_stddev_override: '',
  inflation_mean: 3.0,
  inflation_stddev: 1.5,
}

const toNumberOrNull = value => {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const buildTerminalHistogram = (terminalValues, binCount = 24) => {
  if (!Array.isArray(terminalValues) || terminalValues.length === 0) return []

  const min = Math.min(...terminalValues)
  const max = Math.max(...terminalValues)
  if (min === max) {
    return [{
      label: formatCurrency(min),
      binStart: min,
      binEnd: max,
      count: terminalValues.length,
    }]
  }

  const width = (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: min + i * width,
    binEnd: i === binCount - 1 ? max : min + (i + 1) * width,
    count: 0,
  }))

  terminalValues.forEach(value => {
    const normalized = (value - min) / (max - min)
    const idx = Math.min(binCount - 1, Math.floor(normalized * binCount))
    bins[idx].count += 1
  })

  return bins.map(bin => ({
    ...bin,
    label: formatCurrency((bin.binStart + bin.binEnd) / 2),
  }))
}

function BreakdownTooltip({ value, breakdown, formatEntry }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const entries = breakdown
    ? Object.entries(breakdown).filter(([k, v]) => k !== 'total' && v !== 0)
    : []

  if (entries.length === 0) return <span>{formatEntry ? formatEntry('total', value) : formatCurrency(value)}</span>

  return (
    <span
      style={{ cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}
      onMouseEnter={e => { setVisible(true); setPos({ x: e.clientX, y: e.clientY }) }}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setVisible(false)}
    >
      {formatEntry ? formatEntry('total', value) : formatCurrency(value)}
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.x + 14,
          top: pos.y + 14,
          zIndex: 9999,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 12,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          minWidth: 200,
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Breakdown</div>
          {entries.map(([k, v]) => {
            if (v !== null && typeof v === 'object') {
              const subEntries = Object.entries(v).filter(([sk, sv]) => sk !== 'total' && sv !== 0)
              const subTotal = v.total ?? subEntries.reduce((s, [, sv]) => s + sv, 0)
              return (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 2 }}>
                    <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span>{formatCurrency(subTotal)}</span>
                  </div>
                  {subEntries.map(([sk, sv]) => (
                    <div key={sk} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 2, paddingLeft: 12 }}>
                      <span style={{ color: 'var(--text-muted)' }}>↳ {sk}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatCurrency(sv)}</span>
                    </div>
                  ))}
                </div>
              )
            }
            return (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
                <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {k.replace(/_/g, ' ')}
                </span>
                <span>{formatEntry ? formatEntry(k, v) : formatCurrency(v)}</span>
              </div>
            )
          })}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', gap: 20, fontWeight: 600 }}>
            <span>Total</span>
            <span>{formatEntry ? formatEntry('total', value) : formatCurrency(value)}</span>
          </div>
        </div>
      )}
    </span>
  )
}

export default function Simulator() {
  const [scenarios, setScenarios] = useState([])
  const [scenarioId, setScenarioId] = useState('base')
  const [results, setResults] = useState(null)
  const [monteCarloResults, setMonteCarloResults] = useState(null)
  const [mcParams, setMcParams] = useState(DEFAULT_MC_PARAMS)
  const [chartsReady, setChartsReady] = useState(false)
  const [tab, setTab] = useState('portfolio')
  const [running, setRunning] = useState(false)
  const [runningMc, setRunningMc] = useState(false)
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
    const hasChartData = tab === 'monte-carlo' ? Boolean(monteCarloResults) : Boolean(results)
    if (!hasChartData) {
      setChartsReady(false)
      return undefined
    }

    const frameId = requestAnimationFrame(() => setChartsReady(true))
    return () => cancelAnimationFrame(frameId)
  }, [results, monteCarloResults, tab])

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

  const runMc = async () => {
    setRunningMc(true); setError(''); setChartsReady(false)
    try {
      const res = await runMonteCarlo(scenarioId, {
        n_simulations: Number(mcParams.n_simulations) || 3000,
        return_mean_override: toNumberOrNull(mcParams.return_mean_override),
        return_stddev_override: toNumberOrNull(mcParams.return_stddev_override),
        inflation_mean: Number(mcParams.inflation_mean) || 3.0,
        inflation_stddev: Number(mcParams.inflation_stddev) || 1.5,
      })
      setMonteCarloResults(res)
      setTab('monte-carlo')
    } catch (err) {
      setError(err.response?.data?.detail || 'Monte Carlo simulation failed — check your profile and account assumptions.')
    }
    setRunningMc(false)
  }

  const retirementAge = results?.find(r => r.is_working === false)?.age
  const hasAnyResults = Boolean(results || monteCarloResults)
  const mcByYearData = monteCarloResults
    ? monteCarloResults.ages.map((age, i) => {
      const p10 = monteCarloResults.p10_by_year?.[i] ?? 0
      const p25 = monteCarloResults.p25_by_year?.[i] ?? 0
      const p75 = monteCarloResults.p75_by_year?.[i] ?? 0
      const p90 = monteCarloResults.p90_by_year?.[i] ?? 0

      return {
        age,
        median: monteCarloResults.median_by_year?.[i] ?? 0,
        p10,
        p25,
        p75,
        p90,
        p10_to_p90: p90 - p10,
        p25_to_p75: p75 - p25,
      }
    })
    : []
  const mcTerminalHistogram = buildTerminalHistogram(monteCarloResults?.terminal_values)

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
          <button className="btn-secondary" onClick={runMc} disabled={runningMc}>
            {runningMc ? 'Running MC…' : '🎲 Run Monte Carlo'}
          </button>

        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {hasAnyResults && (
        <>
          {/* Summary stats */}
          {results && (
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
          )}

          <div className="tab-group" style={{ marginBottom: 12 }}>
            {['portfolio','income/expenses','table','monte-carlo'].map(t => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {tab === 'portfolio' && (
            results ? (
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
            ) : (
              <div className="card">
                <div className="empty-state">
                  <h3>Run Deterministic Simulation First</h3>
                  <p>This tab uses deterministic results. Use ▶ Run Simulation or switch to monte-carlo.</p>
                </div>
              </div>
            )
          )}

          {tab === 'income/expenses' && (
            results ? (
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
            ) : (
              <div className="card">
                <div className="empty-state">
                  <h3>Run Deterministic Simulation First</h3>
                  <p>This tab uses deterministic results. Use ▶ Run Simulation or switch to monte-carlo.</p>
                </div>
              </div>
            )
          )}

          {tab === 'table' && (
            results ? (
            <>
              <div className="card">
                <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                  <table>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface2)' }}>
                      <tr>
                        <th>Year</th><th>Age</th><th>Net Worth</th><th>Liquid</th><th>RE Equity</th>
                        <th>Income</th><th>Expenses</th><th>Withdrawals</th><th>Taxes</th><th>Surplus</th><th>Solvent</th>
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
                          <td style={{ color: 'var(--green)' }}>
                            <BreakdownTooltip value={r.income} breakdown={r._income_detail} />
                          </td>
                          <td style={{ color: 'var(--red)' }}>
                            <BreakdownTooltip value={r.expenses} breakdown={r._expenses_detail} />
                          </td>
                          <td>
                            <BreakdownTooltip value={r.withdrawals} breakdown={r._withdrawals_detail} />
                          </td>
                          <td>
                            <BreakdownTooltip
                              value={r.taxes}
                              breakdown={r._taxes_detail}
                              formatEntry={(k, v) =>
                                k === 'effective_rate' || k === 'marginal_rate' ? `${v}%` : formatCurrency(v)
                              }
                            />
                          </td>
                          <td style={{ color: r.cash_surplus_deficit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            <BreakdownTooltip
                              value={r.cash_surplus_deficit}
                              breakdown={r._surplus_detail}
                              formatEntry={(k, v) => {
                                if (k === 'total') return formatCurrency(v)
                                return `${v >= 0 ? '+' : '-'}${formatCurrency(Math.abs(v))}`
                              }}
                            />
                          </td>
                          <td>{r.is_solvent ? '✓' : '⚠'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <h3 style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Taxable Basis Tracker (Pooled Basis)</h3>
                <p className="small-muted" style={{ marginTop: 0, marginBottom: 10 }}>
                  Pooled-basis model: each taxable withdrawal is treated as a pro-rata split of principal and gains.
                </p>
                <div style={{ overflowX: 'auto', maxHeight: '44vh', overflowY: 'auto' }}>
                  <table>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface2)' }}>
                      <tr>
                        <th>Year</th>
                        <th>Age</th>
                        <th>Taxable Balance</th>
                        <th>Principal Remaining (Basis)</th>
                        <th>Modeled Unrealized Gain</th>
                        <th>Modeled Gain Ratio</th>
                        <th>Next $10k: Principal</th>
                        <th>Next $10k: Gains</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => {
                        const t = r.taxable_basis_tracker || {}
                        const ratioPct = (t.total_modeled_gain_ratio || 0) * 100
                        return (
                          <tr key={`tb-${i}`}>
                            <td>{r.year}</td>
                            <td>{r.age}</td>
                            <td>{formatCurrency(t.total_taxable_balance || 0)}</td>
                            <td>{formatCurrency(t.total_basis_remaining || 0)}</td>
                            <td>{formatCurrency(t.total_modeled_unrealized_gain || 0)}</td>
                            <td>{ratioPct.toFixed(2)}%</td>
                            <td>{formatCurrency(t.total_modeled_next_principal || 0)}</td>
                            <td>{formatCurrency(t.total_modeled_next_gains || 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <h3>Run Deterministic Simulation First</h3>
                  <p>This tab uses deterministic results. Use ▶ Run Simulation or switch to monte-carlo.</p>
                </div>
              </div>
            )
          )}

          {tab === 'monte-carlo' && (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>Monte Carlo Assumptions</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Simulations
                    <input
                      type="number"
                      min={500}
                      step={500}
                      value={mcParams.n_simulations}
                      onChange={e => setMcParams(p => ({ ...p, n_simulations: e.target.value }))}
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Return Mean Override (%)
                    <input
                      type="number"
                      step={0.1}
                      placeholder="Use account defaults"
                      value={mcParams.return_mean_override}
                      onChange={e => setMcParams(p => ({ ...p, return_mean_override: e.target.value }))}
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Return Std Dev Override (%)
                    <input
                      type="number"
                      step={0.1}
                      placeholder="Use account defaults"
                      value={mcParams.return_stddev_override}
                      onChange={e => setMcParams(p => ({ ...p, return_stddev_override: e.target.value }))}
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Inflation Mean (%)
                    <input
                      type="number"
                      step={0.1}
                      value={mcParams.inflation_mean}
                      onChange={e => setMcParams(p => ({ ...p, inflation_mean: e.target.value }))}
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Inflation Std Dev (%)
                    <input
                      type="number"
                      step={0.1}
                      value={mcParams.inflation_stddev}
                      onChange={e => setMcParams(p => ({ ...p, inflation_stddev: e.target.value }))}
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn-primary" onClick={runMc} disabled={runningMc}>{runningMc ? 'Running MC…' : 'Run Monte Carlo'}</button>
                  <button className="btn-secondary" onClick={() => setMcParams(DEFAULT_MC_PARAMS)} disabled={runningMc}>Reset</button>
                </div>
              </div>

              {monteCarloResults ? (
                <>
                  <div className="stats-row" style={{ marginBottom: 16 }}>
                    <div className="stat-card">
                      <div className="stat-label">Success Rate</div>
                      <div className="stat-value accent">{formatPct(monteCarloResults.success_rate)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Median Terminal Wealth</div>
                      <div className="stat-value">{formatCurrency(monteCarloResults.median_terminal_wealth)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">10th / 90th Percentile</div>
                      <div className="stat-value" style={{ fontSize: 16 }}>{formatCurrency(monteCarloResults.percentile_10)} / {formatCurrency(monteCarloResults.percentile_90)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Worst / Best Case</div>
                      <div className="stat-value" style={{ fontSize: 16 }}>{formatCurrency(monteCarloResults.worst_case)} / {formatCurrency(monteCarloResults.best_case)}</div>
                    </div>
                  </div>

                  <div className="card" style={{ marginBottom: 12 }}>
                    <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Portfolio Outcome Bands by Age</h3>
                    <MeasuredChart height={340}>
                      {!chartsReady ? null : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={340}>
                          <ComposedChart data={mcByYearData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                            <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Area type="monotone" dataKey="p10" stackId="band10" fill="transparent" stroke="transparent" name="10th Percentile" />
                            <Area type="monotone" dataKey="p10_to_p90" stackId="band10" fill="rgba(79,142,247,0.15)" stroke="transparent" name="10-90% Band" />
                            <Area type="monotone" dataKey="p25" stackId="band25" fill="transparent" stroke="transparent" name="25th Percentile" />
                            <Area type="monotone" dataKey="p25_to_p75" stackId="band25" fill="rgba(34,197,94,0.18)" stroke="transparent" name="25-75% Band" />
                            <Line type="monotone" dataKey="median" name="Median Path" stroke="#4f8ef7" strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="p10" name="10th Percentile" stroke="#ef4444" strokeWidth={1.3} dot={false} />
                            <Line type="monotone" dataKey="p90" name="90th Percentile" stroke="#22c55e" strokeWidth={1.3} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </MeasuredChart>
                  </div>

                  <div className="card">
                    <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>Terminal Wealth Distribution</h3>
                    <MeasuredChart height={300}>
                      {!chartsReady ? null : (
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={300}>
                          <ComposedChart data={mcTerminalHistogram}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
                            <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <Tooltip
                              formatter={(v, n) => [v, n]}
                              labelFormatter={(_, payload) => {
                                const row = payload?.[0]?.payload
                                return row ? `${formatCurrency(row.binStart)} to ${formatCurrency(row.binEnd)}` : ''
                              }}
                              contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }}
                            />
                            <Bar dataKey="count" name="Simulations" fill="#4f8ef7" opacity={0.85} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </MeasuredChart>
                  </div>
                </>
              ) : (
                <div className="card">
                  <div className="empty-state">
                    <div style={{ fontSize: 42, marginBottom: 14 }}>🎲</div>
                    <h3>No Monte Carlo Results Yet</h3>
                    <p>Run Monte Carlo to see optimistic/pessimistic outcome bands, not just one deterministic path.</p>
                  </div>
                </div>
              )}
            </>
          )}


        </>
      )}

      {!hasAnyResults && !running && !runningMc && !error && (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3>Ready to Simulate</h3>
            <p>Select a scenario and click Run Simulation or Run Monte Carlo to generate your projection.</p>
          </div>
        </div>
      )}
    </div>
  )
}
