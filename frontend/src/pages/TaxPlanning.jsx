import { useState, useEffect } from 'react'
import { getScenarios, optimizeRothConversion, optimizeSocialSecurity, optimizeLifetimeBracketFill } from '../api'
import { formatCurrency } from '../components/shared'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

const STRATEGY_COLORS = {
  no_conversion: '#6b7280',
  fill_12: '#4f8ef7',
  fill_22: '#22c55e',
  fill_24: '#f59e0b',
}

export default function TaxPlanning() {
  const [scenarios, setScenarios] = useState([])
  const [scenarioId, setScenarioId] = useState('base')
  const [tab, setTab] = useState('roth')
  const [rothResults, setRothResults] = useState(null)
  const [ssResults, setSsResults] = useState(null)
  const [bracketFillResults, setBracketFillResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getScenarios().then(s => {
      setScenarios(s)
      if (s.length > 0) setScenarioId(s.find(x => x.is_base)?.id ?? s[0].id)
    })
  }, [])

  const runRoth = async () => {
    setRunning(true); setError('')
    try {
      const res = await optimizeRothConversion(scenarioId)
      setRothResults(res)
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed')
    }
    setRunning(false)
  }

  const runSS = async () => {
    setRunning(true); setError('')
    try {
      const res = await optimizeSocialSecurity(scenarioId)
      setSsResults(res)
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed')
    }
    setRunning(false)
  }

  const runBracketFill = async () => {
    setRunning(true); setError('')
    try {
      const res = await optimizeLifetimeBracketFill(scenarioId)
      setBracketFillResults(res)
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed')
    }
    setRunning(false)
  }

  // Roth chart: total taxes paid by strategy
  const rothTaxChart = rothResults ? Object.entries(rothResults.strategies).map(([key, val]) => ({
    strategy: key.replace('_', ' '),
    total_taxes: val.total_taxes_paid,
    total_converted: val.total_converted,
  })) : []

  // SS chart — use claiming analysis if available
  const ssChartData = ssResults?.claiming_ages?.map(a => ({
    age: a.claiming_age,
    monthly: a.monthly_benefit,
    at85: a.cumulative_at_85,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tax Planning</h1>
          <p className="page-subtitle">Roth conversion optimizer · Social Security optimization · Lifetime bracket fill strategy</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={scenarioId} onChange={e => setScenarioId(e.target.value)} style={{ fontSize: 13 }}>
            <option value="base">— Base Plan —</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="tab-group" style={{ marginBottom: 16 }}>
        <button className={`tab${tab === 'roth' ? ' active' : ''}`} onClick={() => setTab('roth')}>Roth Conversion</button>
        <button className={`tab${tab === 'ss' ? ' active' : ''}`} onClick={() => setTab('ss')}>Social Security</button>
        <button className={`tab${tab === 'bracket' ? ' active' : ''}`} onClick={() => setTab('bracket')}>Lifetime Bracket Fill</button>
      </div>

      {tab === 'roth' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-primary" onClick={runRoth} disabled={running}>
              {running ? 'Analyzing…' : '🔄 Analyze Roth Conversions'}
            </button>
          </div>

          {!rothResults && !running && (
            <div className="card">
              <div className="empty-state">
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <h3>Roth Conversion Optimizer</h3>
                <p style={{ maxWidth: 440, textAlign: 'center' }}>
                  Analyzes 4 strategies: no conversion, fill to 12%, 22%, and 24% brackets
                  during the gap between retirement and Social Security / RMD onset.
                  Identifies the strategy that minimizes lifetime tax burden.
                </p>
                <button className="btn-primary" onClick={runRoth} style={{ marginTop: 16 }}>Run Analysis</button>
              </div>
            </div>
          )}

          {rothResults && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <h3 style={{ marginBottom: 4, fontSize: 14, fontWeight: 600 }}>Strategy Comparison</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
                  Conversion window: age {rothResults.gap_start_age}–{rothResults.gap_end_age} ·
                  Traditional balance: {formatCurrency(rothResults.current_trad_balance)}
                </p>
                <div className="chart-container" style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rothTaxChart} margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="strategy" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="total_taxes" name="Total Taxes Paid" fill="#ef4444" opacity={0.85} />
                      <Bar dataKey="total_converted" name="Amount Converted" fill="#4f8ef7" opacity={0.7} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Strategies Summary</h3>
                <table>
                  <thead><tr><th>Strategy</th><th>Total Converted</th><th>Total Taxes</th><th>Tax Savings vs None</th></tr></thead>
                  <tbody>
                    {Object.entries(rothResults.strategies).map(([key, val]) => {
                      const baseline = rothResults.strategies.no_conversion?.total_taxes_paid ?? 0
                      const savings = baseline - val.total_taxes_paid
                      return (
                        <tr key={key} style={{ background: key === rothResults.recommended_strategy ? 'rgba(34,197,94,0.08)' : '' }}>
                          <td>
                            <span className="tag" style={{ background: STRATEGY_COLORS[key], color: '#fff' }}>
                              {key === rothResults.recommended_strategy ? '★ ' : ''}{key.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>{formatCurrency(val.total_converted)}</td>
                          <td>{formatCurrency(val.total_taxes_paid)}</td>
                          <td style={{ color: savings > 0 ? 'var(--green)' : savings < 0 ? 'var(--red)' : '' }}>
                            {savings > 0 ? '+' : ''}{formatCurrency(savings)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {rothResults.recommended_strategy && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(34,197,94,0.1)', borderRadius: 6, fontSize: 13 }}>
                    ✅ <strong>Recommended:</strong> {rothResults.recommended_strategy.replace(/_/g, ' ')} — saves {formatCurrency((rothResults.strategies.no_conversion?.total_taxes_paid ?? 0) - rothResults.strategies[rothResults.recommended_strategy]?.total_taxes_paid)} in total taxes
                  </div>
                )}
              </div>

              {/* Conversion schedule */}
              {Object.entries(rothResults.strategies).filter(([, v]) => v.conversion_by_year?.length > 0).map(([key, val]) => (
                <div className="card" key={key} style={{ gridColumn: '1 / -1' }}>
                  <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
                    Conversion Schedule — {key.replace(/_/g, ' ')}
                    {key === rothResults.recommended_strategy ? ' ★ Recommended' : ''}
                  </h3>
                  <table>
                    <thead><tr><th>Age</th><th>Conversion Amount</th><th>Estimated Tax</th><th>Top Bracket</th></tr></thead>
                    <tbody>
                      {val.conversion_by_year.map((yr, i) => (
                        <tr key={i}>
                          <td>{yr.age}</td>
                          <td style={{ color: 'var(--accent)' }}>{formatCurrency(yr.conversion_amount)}</td>
                          <td>{formatCurrency(yr.estimated_tax)}</td>
                          <td><span className="tag">{yr.top_bracket_pct}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'ss' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-primary" onClick={runSS} disabled={running}>
              {running ? 'Analyzing…' : '📊 Analyze SS Timing'}
            </button>
          </div>

          {!ssResults && !running && (
            <div className="card">
              <div className="empty-state">
                <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
                <h3>Social Security Timing Optimizer</h3>
                <p style={{ maxWidth: 440, textAlign: 'center' }}>
                  Analyzes the impact of claiming Social Security at ages 62–70 on cumulative lifetime benefits.
                  Configure your SS benefit on the Social Security page first.
                </p>
                <button className="btn-primary" onClick={runSS} style={{ marginTop: 16 }}>Run Analysis</button>
              </div>
            </div>
          )}

          {ssResults && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Monthly Benefit by Claiming Age</h3>
                <div className="chart-container" style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ssChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                      <Tooltip formatter={(v, n) => [formatCurrency(v), n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                      <Bar dataKey="monthly" name="Monthly Benefit" fill="#4f8ef7" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Claiming Age Analysis</h3>
                <table>
                  <thead><tr><th>Age</th><th>Monthly</th><th>Annual</th><th>vs FRA</th></tr></thead>
                  <tbody>
                    {ssResults.claiming_ages.map(a => (
                      <tr key={a.claiming_age} style={{ background: a.claiming_age === ssResults.recommended_age ? 'rgba(79,142,247,0.08)' : '' }}>
                        <td>{a.claiming_age === ssResults.recommended_age ? `★ ${a.claiming_age}` : a.claiming_age}</td>
                        <td>{formatCurrency(a.monthly_benefit)}</td>
                        <td>{formatCurrency(a.monthly_benefit * 12)}</td>
                        <td style={{ color: a.reduction_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {a.reduction_pct >= 0 ? '+' : ''}{a.reduction_pct?.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {ssResults.break_even_ages && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Break-even Ages</h4>
                    {Object.entries(ssResults.break_even_ages).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 13, color: 'var(--text-muted)', padding: '3px 0' }}>
                        {k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--text)' }}>{v ? `Age ${v}` : 'Never'}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'bracket' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-primary" onClick={runBracketFill} disabled={running}>
              {running ? 'Analyzing…' : '💰 Analyze Lifetime Strategy'}
            </button>
          </div>

          {!bracketFillResults && !running && (
            <div className="card">
              <div className="empty-state">
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                <h3>Lifetime Tax Bracket Fill Strategy</h3>
                <p style={{ maxWidth: 440, textAlign: 'center' }}>
                  Analyzes your entire retirement timeline to identify years where you could withdraw
                  additional funds from tax-deferred accounts without pushing into higher tax brackets.
                  This can significantly reduce your lifetime tax burden.
                </p>
                <button className="btn-primary" onClick={runBracketFill} style={{ marginTop: 16 }}>Run Analysis</button>
              </div>
            </div>
          )}

          {bracketFillResults && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Lifetime Tax Comparison</h3>
                <div style={{ padding: '12px 0' }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Current Strategy</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {formatCurrency(bracketFillResults.baseline_lifetime_taxes)}
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>With Bracket Fill Optimization</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                      {formatCurrency(bracketFillResults.optimized_lifetime_taxes)}
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: 'rgba(34,197,94,0.1)', borderRadius: 6, borderLeft: '3px solid var(--green)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Potential Lifetime Savings</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>
                      {formatCurrency(bracketFillResults.lifetime_tax_savings)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Summary</h3>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ color: 'var(--text)' }}>Opportunities Found:</strong> {bracketFillResults.fill_opportunities?.length || 0} years
                  </div>
                  {bracketFillResults.fill_opportunities?.length > 0 && (
                    <div>
                      <strong style={{ color: 'var(--text)' }}>Total Recommended Additional Withdrawals:</strong>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>
                        {formatCurrency(bracketFillResults.recommended_total_additional_withdrawals)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {bracketFillResults.fill_opportunities && bracketFillResults.fill_opportunities.length > 0 && (
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Year-by-Year Opportunities</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Age</th>
                        <th>Year</th>
                        <th>Base Income</th>
                        <th>SS Income</th>
                        <th>Room to 22%</th>
                        <th>Recommended Withdrawal</th>
                        <th>Tax Impact</th>
                        <th>Potential Savings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bracketFillResults.fill_opportunities.map((opp, i) => (
                        <tr key={i}>
                          <td><strong>{opp.age}</strong></td>
                          <td>{opp.year}</td>
                          <td>{formatCurrency(opp.ordinary_income)}</td>
                          <td>{formatCurrency(opp.ss_income)}</td>
                          <td style={{ color: 'var(--accent)' }}>{formatCurrency(opp.space_to_22_bracket)}</td>
                          <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                            {formatCurrency(opp.recommended_withdrawal)}
                          </td>
                          <td>{formatCurrency(opp.tax_with_recommendation)}</td>
                          <td style={{ color: opp.tax_savings > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                            {opp.tax_savings > 0 ? '+' : ''}{formatCurrency(opp.tax_savings)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
