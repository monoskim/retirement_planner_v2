import { useState, useEffect } from 'react'
import { getIncomeSources, createIncomeSource, updateIncomeSource, deleteIncomeSource } from '../api'
import { FormField, Modal, EmptyState, formatCurrency } from '../components/shared'

const INCOME_TYPES = ['salary','rental','pension','social_security','part_time','annuity','other']
const TAX_TREATMENTS = ['ordinary','capital_gains','exempt','social_security']

const BLANK = {
  name: '', income_type: 'salary', annual_amount: 0,
  start_age: '', end_age: '', inflation_adjusted: false,
  tax_treatment: 'ordinary', notes: '',
}

export default function Income() {
  const [sources, setSources] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')

  const load = () => getIncomeSources().then(setSources)
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openAdd = () => { setForm(BLANK); setError(''); setModal('add') }
  const openEdit = s => { setForm({ ...s, start_age: s.start_age ?? '', end_age: s.end_age ?? '' }); setError(''); setModal({ editing: s }) }

  const submit = async e => {
    e.preventDefault(); setError('')
    const payload = {
      ...form,
      start_age: form.start_age === '' ? null : +form.start_age,
      end_age: form.end_age === '' ? null : +form.end_age,
    }
    try {
      if (modal === 'add') await createIncomeSource(payload)
      else await updateIncomeSource(modal.editing.id, payload)
      await load(); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const remove = async id => {
    if (!confirm('Delete this income source?')) return
    await deleteIncomeSource(id); load()
  }

  const total = sources.reduce((s, i) => s + i.annual_amount, 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Income Sources</h1>
          <p className="page-subtitle">Total: {formatCurrency(total)}/yr</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Income</button>
      </div>

      {sources.length === 0
        ? <EmptyState icon="💰" title="No income sources" subtitle="Add salary, rental income, pension, etc." action={<button className="btn-primary" onClick={openAdd}>Add Income</button>} />
        : (
          <div className="card">
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Amount/yr</th><th>Age Range</th><th>Inflation</th><th>Tax</th><th></th></tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td><span className="tag">{s.income_type}</span></td>
                    <td>{formatCurrency(s.annual_amount)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.start_age ?? '—'}–{s.end_age ?? '∞'}</td>
                    <td>{s.inflation_adjusted ? '✓' : '—'}</td>
                    <td><span className="tag">{s.tax_treatment}</span></td>
                    <td>
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(s)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(s.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Income Source' : 'Edit Income Source'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" form="income-form" type="submit">Save</button>
          </>}
        >
          <form id="income-form" onSubmit={submit}>
            <div className="form-grid">
              <FormField label="Name" fullWidth>
                <input value={form.name} onChange={e => set('name', e.target.value)} required />
              </FormField>
              <FormField label="Income Type">
                <select value={form.income_type} onChange={e => set('income_type', e.target.value)}>
                  {INCOME_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Annual Amount ($)">
                <input type="number" step="0.01" min="0" value={form.annual_amount} onChange={e => set('annual_amount', +e.target.value)} />
              </FormField>
              <FormField label="Start Age (leave blank = now)">
                <input type="number" min="0" max="120" value={form.start_age} onChange={e => set('start_age', e.target.value)} />
              </FormField>
              <FormField label="End Age (leave blank = forever)">
                <input type="number" min="0" max="120" value={form.end_age} onChange={e => set('end_age', e.target.value)} />
              </FormField>
              <FormField label="Tax Treatment">
                <select value={form.tax_treatment} onChange={e => set('tax_treatment', e.target.value)}>
                  {TAX_TREATMENTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" id="infl" style={{ width: 'auto' }} checked={form.inflation_adjusted} onChange={e => set('inflation_adjusted', e.target.checked)} />
                <label htmlFor="infl" style={{ marginBottom: 0 }}>Inflation-adjusted</label>
              </div>
              <FormField label="Notes" fullWidth>
                <input value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
              </FormField>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}
    </div>
  )
}
