import { useState, useEffect } from 'react'
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../api'
import { FormField, Modal, EmptyState, formatCurrency } from '../components/shared'

const ACCOUNT_TYPES = ['401k','403b','trad_ira','roth_ira','roth_401k','taxable','hsa','pension','cash']

const BLANK = {
  name: '', account_type: '401k', balance: 0, annual_contribution: 0,
  employer_match_pct: 0, employer_match_limit_pct: 0,
  expected_return_pct: 7.0, return_stddev_pct: 15.0, cost_basis: 0, notes: '',
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [modal, setModal] = useState(null) // null | 'add' | {editing: acc}
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')

  const load = () => getAccounts().then(setAccounts)
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openAdd = () => { setForm(BLANK); setError(''); setModal('add') }
  const openEdit = acc => { setForm({ ...acc }); setError(''); setModal({ editing: acc }) }

  const submit = async e => {
    e.preventDefault(); setError('')
    try {
      if (modal === 'add') await createAccount(form)
      else await updateAccount(modal.editing.id, form)
      await load(); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const remove = async id => {
    if (!confirm('Delete this account?')) return
    await deleteAccount(id); load()
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Total: {formatCurrency(totalBalance)}</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Account</button>
      </div>

      {accounts.length === 0
        ? <EmptyState icon="🏦" title="No accounts yet" subtitle="Add your investment and savings accounts." action={<button className="btn-primary" onClick={openAdd}>Add Account</button>} />
        : (
          <div className="card">
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Balance</th><th>Return</th><th>Contribution/yr</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td><span className="tag">{a.account_type}</span></td>
                    <td>{formatCurrency(a.balance)}</td>
                    <td>{a.expected_return_pct}%</td>
                    <td>{formatCurrency(a.annual_contribution)}</td>
                    <td style={{ color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes}</td>
                    <td>
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(a)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(a.id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {modal && (
        <Modal
          title={modal === 'add' ? 'Add Account' : 'Edit Account'}
          onClose={() => setModal(null)}
          footer={<>
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" form="account-form" type="submit">Save</button>
          </>}
        >
          <form id="account-form" onSubmit={submit}>
            <div className="form-grid">
              <FormField label="Account Name" fullWidth>
                <input value={form.name} onChange={e => set('name', e.target.value)} required />
              </FormField>
              <FormField label="Account Type">
                <select value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                  {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Current Balance ($)">
                <input type="number" step="0.01" min="0" value={form.balance} onChange={e => set('balance', +e.target.value)} />
              </FormField>
              <FormField label="Annual Contribution ($)">
                <input type="number" step="0.01" min="0" value={form.annual_contribution} onChange={e => set('annual_contribution', +e.target.value)} />
              </FormField>
              <FormField label="Employer Match (%)">
                <input type="number" step="0.1" min="0" max="100" value={form.employer_match_pct} onChange={e => set('employer_match_pct', +e.target.value)} />
              </FormField>
              <FormField label="Match Limit (% of contrib)">
                <input type="number" step="0.1" min="0" max="100" value={form.employer_match_limit_pct} onChange={e => set('employer_match_limit_pct', +e.target.value)} />
              </FormField>
              <FormField label="Expected Return (%)">
                <input type="number" step="0.1" min="-50" max="100" value={form.expected_return_pct} onChange={e => set('expected_return_pct', +e.target.value)} />
              </FormField>
              <FormField label="Return Std Dev (% for Monte Carlo)">
                <input type="number" step="0.1" min="0" max="100" value={form.return_stddev_pct} onChange={e => set('return_stddev_pct', +e.target.value)} />
              </FormField>
              <FormField label="Cost Basis ($) — taxable accounts">
                <input type="number" step="0.01" min="0" value={form.cost_basis} onChange={e => set('cost_basis', +e.target.value)} />
              </FormField>
              <FormField label="Notes">
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
