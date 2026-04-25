import { useState, useEffect } from 'react'
import { getExpenses, createExpense, updateExpense, deleteExpense } from '../api'
import { FormField, Modal, EmptyState, formatCurrency } from '../components/shared'

const CATEGORIES = ['housing','travel','medical','food','insurance','taxes','transportation','entertainment','other']

const BLANK = {
  name: '', category: 'housing', annual_amount: 0,
  start_age: '', end_age: '', inflation_adjusted: true, notes: '',
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')

  const load = () => getExpenses().then(setExpenses)
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openAdd = () => { setForm(BLANK); setError(''); setModal('add') }
  const openEdit = e => { setForm({ ...e, start_age: e.start_age ?? '', end_age: e.end_age ?? '' }); setError(''); setModal({ editing: e }) }

  const submit = async e => {
    e.preventDefault(); setError('')
    const payload = {
      ...form,
      start_age: form.start_age === '' ? null : +form.start_age,
      end_age: form.end_age === '' ? null : +form.end_age,
    }
    try {
      if (modal === 'add') await createExpense(payload)
      else await updateExpense(modal.editing.id, payload)
      await load(); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const remove = async id => {
    if (!confirm('Delete this expense?')) return
    await deleteExpense(id); load()
  }

  const total = expenses.reduce((s, e) => s + e.annual_amount, 0)

  // Group by category for summary
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.annual_amount
    return acc
  }, {})

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Total: {formatCurrency(total)}/yr</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Expense</button>
      </div>

      {Object.keys(byCategory).length > 0 && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          {Object.entries(byCategory).sort(([, a], [, b]) => b - a).slice(0, 5).map(([cat, amt]) => (
            <div className="stat-card" key={cat} style={{ flex: 'none', minWidth: 120 }}>
              <div className="stat-label">{cat}</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{formatCurrency(amt)}</div>
            </div>
          ))}
        </div>
      )}

      {expenses.length === 0
        ? <EmptyState icon="💸" title="No expenses" subtitle="Add annual living expenses, travel, medical costs, etc." action={<button className="btn-primary" onClick={openAdd}>Add Expense</button>} />
        : (
          <div className="card">
            <table>
              <thead>
                <tr><th>Name</th><th>Category</th><th>Amount/yr</th><th>Age Range</th><th>Inflation</th><th></th></tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td><span className="tag">{e.category}</span></td>
                    <td>{formatCurrency(e.annual_amount)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{e.start_age ?? '—'}–{e.end_age ?? '∞'}</td>
                    <td>{e.inflation_adjusted ? '✓' : '—'}</td>
                    <td>
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(e)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(e.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Expense' : 'Edit Expense'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" form="expense-form" type="submit">Save</button>
          </>}
        >
          <form id="expense-form" onSubmit={submit}>
            <div className="form-grid">
              <FormField label="Name" fullWidth>
                <input value={form.name} onChange={e => set('name', e.target.value)} required />
              </FormField>
              <FormField label="Category">
                <select value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="Annual Amount ($)">
                <input type="number" step="0.01" min="0" value={form.annual_amount} onChange={e => set('annual_amount', +e.target.value)} />
              </FormField>
              <FormField label="Start Age">
                <input type="number" min="0" max="120" value={form.start_age} onChange={e => set('start_age', e.target.value)} />
              </FormField>
              <FormField label="End Age">
                <input type="number" min="0" max="120" value={form.end_age} onChange={e => set('end_age', e.target.value)} />
              </FormField>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" id="exp-infl" style={{ width: 'auto' }} checked={form.inflation_adjusted} onChange={e => set('inflation_adjusted', e.target.checked)} />
                <label htmlFor="exp-infl" style={{ marginBottom: 0 }}>Inflation-adjusted</label>
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
