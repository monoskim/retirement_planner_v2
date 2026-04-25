import { useState, useEffect } from 'react'
import { getProfile, saveProfile } from '../api'
import { FormField } from '../components/shared'

const FILING_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married_jointly', label: 'Married Filing Jointly' },
  { value: 'married_separately', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
]

const DEFAULT = {
  name: 'Me',
  birth_date: '',
  filing_status: 'single',
  state: 'NV',
  retirement_age: 65,
  life_expectancy: 95,
  inflation_rate: 3.0,
}

export default function Profile() {
  const [form, setForm] = useState(DEFAULT)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProfile().then(p => {
      if (p) setForm({ ...p, birth_date: p.birth_date?.split('T')[0] || p.birth_date })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    try {
      await saveProfile(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed')
    }
  }

  if (loading) return <div className="loading">Loading…</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Personal details used in all projections</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={submit}>
          <div className="form-grid">
            <FormField label="Your Name">
              <input value={form.name} onChange={e => set('name', e.target.value)} />
            </FormField>
            <FormField label="Date of Birth">
              <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} required />
            </FormField>
            <FormField label="Filing Status">
              <select value={form.filing_status} onChange={e => set('filing_status', e.target.value)}>
                {FILING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>
            <FormField label="State">
              <input value={form.state} onChange={e => set('state', e.target.value)} maxLength={2} />
            </FormField>
            <FormField label="Planned Retirement Age">
              <input type="number" min="40" max="90" value={form.retirement_age} onChange={e => set('retirement_age', +e.target.value)} required />
            </FormField>
            <FormField label="Life Expectancy (planning horizon)">
              <input type="number" min="50" max="120" value={form.life_expectancy} onChange={e => set('life_expectancy', +e.target.value)} required />
            </FormField>
            <FormField label="Annual Inflation Rate (%)" fullWidth>
              <input type="number" step="0.1" min="0" max="20" value={form.inflation_rate} onChange={e => set('inflation_rate', +e.target.value)} required />
            </FormField>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="submit" className="btn-primary">Save Profile</button>
            {saved && <span className="success-msg">✓ Saved</span>}
            {error && <span className="error-msg">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
