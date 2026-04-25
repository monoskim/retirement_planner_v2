import { useState, useEffect } from 'react'
import { getSocialSecurity, saveSocialSecurity, optimizeSocialSecurity } from '../api'
import { FormField, formatCurrency } from '../components/shared'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const DEFAULT = {
  fra_monthly_benefit: 0, fra_age: 67, claiming_age: 67,
  spouse_fra_monthly_benefit: 0, spouse_fra_age: 67, spouse_claiming_age: null, notes: '',
}

export default function SocialSecurity() {
  const [form, setForm] = useState(DEFAULT)
  const [analysis, setAnalysis] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    getSocialSecurity().then(d => { if (d) setForm({ ...DEFAULT, ...d }) }).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault(); setError('')
    try {
      await saveSocialSecurity(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const analyze = async () => {
    setAnalyzing(true)
    try {
      const res = await optimizeSocialSecurity('base')
      setAnalysis(res)
    } catch (err) {
      setError(err.response?.data?.detail || 'Analysis failed — save your SS data first')
    }
    setAnalyzing(false)
  }

  const chartData = analysis?.claiming_ages?.map(a => ({
    age: a.claiming_age,
    monthly: a.monthly_benefit,
    at80: a.cumulative_at_80,
    at85: a.cumulative_at_85,
    at90: a.cumulative_at_90,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Social Security</h1>
          <p className="page-subtitle">Enter your estimated benefit from ssa.gov</p>
        </div>
        <button className="btn-secondary" onClick={analyze} disabled={analyzing}>
          {analyzing ? 'Analyzing…' : '📊 Analyze Claiming Ages'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: analysis ? '380px 1fr' : '1fr', gap: 16 }}>
        <div className="card">
          <form onSubmit={submit}>
            <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Your Benefits</h3>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <FormField label="Monthly Benefit at FRA ($)" fullWidth>
                <input type="number" step="1" min="0" value={form.fra_monthly_benefit} onChange={e => set('fra_monthly_benefit', +e.target.value)} />
              </FormField>
              <FormField label="Full Retirement Age">
                <select value={form.fra_age} onChange={e => set('fra_age', +e.target.value)}>
                  {[62,63,64,65,66,67,68,69,70].map(a => <option key={a}>{a}</option>)}
                </select>
              </FormField>
              <FormField label="Planned Claiming Age">
                <select value={form.claiming_age} onChange={e => set('claiming_age', +e.target.value)}>
                  {[62,63,64,65,66,67,68,69,70].map(a => <option key={a}>{a}</option>)}
                </select>
              </FormField>
            </div>

            <h3 style={{ margin: '16px 0 12px', fontSize: 14, fontWeight: 600 }}>Spouse Benefits (optional)</h3>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <FormField label="Spouse Monthly Benefit at FRA ($)" fullWidth>
                <input type="number" step="1" min="0" value={form.spouse_fra_monthly_benefit} onChange={e => set('spouse_fra_monthly_benefit', +e.target.value)} />
              </FormField>
              <FormField label="Spouse FRA">
                <select value={form.spouse_fra_age} onChange={e => set('spouse_fra_age', +e.target.value)}>
                  {[62,63,64,65,66,67,68,69,70].map(a => <option key={a}>{a}</option>)}
                </select>
              </FormField>
              <FormField label="Spouse Claiming Age">
                <select value={form.spouse_claiming_age ?? ''} onChange={e => set('spouse_claiming_age', e.target.value ? +e.target.value : null)}>
                  <option value="">— not set —</option>
                  {[62,63,64,65,66,67,68,69,70].map(a => <option key={a}>{a}</option>)}
                </select>
              </FormField>
            </div>

            <FormField label="Notes" fullWidth>
              <input value={form.notes || ''} onChange={e => set('notes', e.target.value)} style={{ marginTop: 8 }} />
            </FormField>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="submit" className="btn-primary">Save</button>
              {saved && <span className="success-msg">✓ Saved</span>}
              {error && <span className="error-msg">{error}</span>}
            </div>
          </form>
        </div>

        {analysis && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Cumulative Benefits by Claiming Age</h3>
              <div className="chart-container" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="age" stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: 'Claiming Age', position: 'insideBottom', offset: -2, fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v, name) => [formatCurrency(v), name]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="at80" name="By age 80" stroke="#4f8ef7" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="at85" name="By age 85" stroke="#22c55e" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="at90" name="By age 90" stroke="#f59e0b" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Break-even Ages</h3>
              <table>
                <thead><tr><th>Comparison</th><th>Break-even Age</th></tr></thead>
                <tbody>
                  {Object.entries(analysis.break_even_ages).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ color: 'var(--text-muted)' }}>{k.replace(/_/g, ' ')}</td>
                      <td>{v ? `Age ${v}` : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ margin: '16px 0 12px', fontSize: 14, fontWeight: 600 }}>Monthly Benefit by Claiming Age</h3>
              <table>
                <thead><tr><th>Claiming Age</th><th>Monthly Benefit</th><th>Change vs FRA</th></tr></thead>
                <tbody>
                  {analysis.claiming_ages.map(a => (
                    <tr key={a.claiming_age} style={{ background: a.claiming_age === form.claiming_age ? 'rgba(79,142,247,0.08)' : '' }}>
                      <td>{a.claiming_age === form.claiming_age ? `→ ${a.claiming_age}` : a.claiming_age}</td>
                      <td>{formatCurrency(a.monthly_benefit)}/mo</td>
                      <td style={{ color: a.reduction_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {a.reduction_pct >= 0 ? '+' : ''}{a.reduction_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
