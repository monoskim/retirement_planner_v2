import { useState, useEffect } from 'react'
import {
  getSocialSecurity,
  saveSocialSecurity,
  optimizeSocialSecurity,
  getIncomeSources,
  getProfile,
} from '../api'
import { FormField, formatCurrency } from '../components/shared'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const CLAIMING_AGE_STORAGE_KEY = 'retirement-planner.social-security.claiming-age'

const DEFAULT = {
  fra_monthly_benefit: 0, fra_age: 67, claiming_age: 67,
  spouse_fra_monthly_benefit: 0, spouse_fra_age: 67, spouse_claiming_age: null, notes: '',
}

const SS_ESTIMATE = {
  replacementRate: 0.4,
  minMonthly: 600,
  maxMonthly: 4300,
}

function getFraFromBirthYear(birthYear) {
  if (!birthYear || Number.isNaN(birthYear)) return 67
  if (birthYear <= 1937) return 65
  if (birthYear <= 1959) return 66
  return 67
}

function estimateFraBenefitFromIncome(incomeSources) {
  const salaryAnnual = incomeSources
    .filter(s => s.income_type === 'salary' && Number(s.annual_amount) > 0)
    .reduce((sum, s) => sum + Number(s.annual_amount), 0)

  if (salaryAnnual <= 0) {
    return { monthly: 0, salaryAnnual: 0 }
  }

  const estimatedMonthly = Math.round(
    Math.min(
      SS_ESTIMATE.maxMonthly,
      Math.max(SS_ESTIMATE.minMonthly, (salaryAnnual * SS_ESTIMATE.replacementRate) / 12),
    ),
  )

  return { monthly: estimatedMonthly, salaryAnnual }
}

export default function SocialSecurity() {
  const [form, setForm] = useState(DEFAULT)
  const [analysis, setAnalysis] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [estimateInfo, setEstimateInfo] = useState('')

  useEffect(() => {
    getSocialSecurity().then(d => { if (d) setForm({ ...DEFAULT, ...d }) }).catch(() => {})
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CLAIMING_AGE_STORAGE_KEY, String(form.claiming_age))
  }, [form.claiming_age])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const estimateBenefit = async () => {
    setError('')
    setEstimateInfo('')
    try {
      const [incomeSources, profile] = await Promise.all([
        getIncomeSources(),
        getProfile().catch(() => null),
      ])
      const estimate = estimateFraBenefitFromIncome(incomeSources || [])

      if (estimate.monthly <= 0) {
        setError('No salary income found to estimate from. Add a salary source in Income first, or enter SSA estimate manually.')
        return
      }

      const birthYear = profile?.birth_date ? new Date(profile.birth_date).getFullYear() : null
      const fraAge = getFraFromBirthYear(birthYear)
      set('fra_monthly_benefit', estimate.monthly)
      set('fra_age', fraAge)
      setEstimateInfo(`Estimated from salary income (${formatCurrency(estimate.salaryAnnual)}/yr). Use SSA statement for a more accurate value.`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to estimate benefit right now.')
    }
  }

  const submit = async e => {
    e.preventDefault(); setError('')
    try {
      await saveSocialSecurity(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const analyze = async () => {
    setError('')
    if (!form.fra_monthly_benefit || form.fra_monthly_benefit <= 0) {
      setError('Set Monthly Benefit at FRA first, or click "Estimate FRA Benefit".')
      return
    }

    setAnalyzing(true)
    try {
      // Keep backend analysis in sync with current form values.
      await saveSocialSecurity(form)
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
          <p className="page-subtitle">Use SSA statement if available, or estimate from your salary with one click</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={estimateBenefit}>
            Estimate FRA Benefit
          </button>
          <button className="btn-secondary" onClick={analyze} disabled={analyzing}>
            {analyzing ? 'Analyzing…' : '📊 Analyze Claiming Ages'}
          </button>
        </div>
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

            {estimateInfo && <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>{estimateInfo}</p>}

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
