import { useState, useEffect } from 'react'
import {
  getAccounts,
  getIncomeSources,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../api'
import { FormField, Modal, EmptyState, formatCurrency } from '../components/shared'

const ACCOUNT_TYPES = ['401k','403b','trad_ira','roth_ira','roth_401k','taxable','hsa','pension','cash']

const BLANK = {
  name: '', account_type: '401k', balance: 0, annual_contribution: 0,
  contribution_pct: 0,
  employer_match_pct: 0, employer_match_limit_pct: 0,
  expected_return_pct: 7.0, return_stddev_pct: 15.0, cost_basis: 0, notes: '',
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [incomeSources, setIncomeSources] = useState([])
  const [modal, setModal] = useState(null) // null | 'add' | {editing: acc}
  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => getAccounts()
    .then(data => setAccounts(data))
    .catch(() => setLoadError('Could not load accounts. Please retry.'))
    .finally(() => setLoading(false))

  const loadIncome = () => getIncomeSources()
    .then(data => setIncomeSources(data))
    .catch(() => setIncomeSources([]))

  useEffect(() => {
    load()
    loadIncome()
  }, [])

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
  const totalSalary = incomeSources
    .filter(source => source.income_type === 'salary')
    .reduce((sum, source) => sum + source.annual_amount, 0)
  const hasPctContributionAccounts = accounts.some(account => account.contribution_pct > 0)

  const displayEmployeeContribution = account => (
    account.contribution_pct > 0 && totalSalary > 0
      ? totalSalary * (account.contribution_pct / 100)
      : account.annual_contribution
  )

  const displayEmployerContribution = account => {
    const employeeContribution = displayEmployeeContribution(account)
    const matchPct = (account.employer_match_pct || 0) / 100
    const matchLimitPct = (account.employer_match_limit_pct || 0) / 100

    if (matchPct <= 0) return 0

    if (matchLimitPct > 0 && totalSalary > 0) {
      const employeePct = employeeContribution / totalSalary
      return employeePct >= matchLimitPct
        ? totalSalary * matchPct
        : employeeContribution * matchPct / matchLimitPct
    }

    if (totalSalary > 0) return totalSalary * matchPct

    return employeeContribution * matchPct
  }

  const displayTotalContribution = account => (
    displayEmployeeContribution(account) + displayEmployerContribution(account)
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Total: {formatCurrency(totalBalance)}</p>
          {hasPctContributionAccounts && totalSalary <= 0 && (
            <p className="page-subtitle" style={{ color: 'var(--danger)', marginTop: 4 }}>
              Contribution/yr for % based accounts needs at least one income source with Type = salary.
            </p>
          )}
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Account</button>
      </div>

      {loading
        ? <div className="card"><p className="page-subtitle">Loading accounts...</p></div>
        : loadError
        ? (
          <div className="card">
            <p className="error-msg" style={{ marginBottom: 12 }}>{loadError}</p>
            <button
              className="btn-secondary"
              onClick={() => {
                setLoadError('')
                setLoading(true)
                load()
              }}
            >
              Retry
            </button>
          </div>
        )
        : accounts.length === 0
        ? <EmptyState icon="🏦" title="No accounts yet" subtitle="Add your investment and savings accounts." action={<button className="btn-primary" onClick={openAdd}>Add Account</button>} />
        : (
          <div className="card">
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Balance</th><th>Return</th><th>Contributions/yr</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td><span className="tag">{a.account_type}</span></td>
                    <td>{formatCurrency(a.balance)}</td>
                    <td>{a.expected_return_pct}%</td>
                    <td>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div><strong>Employee:</strong> {formatCurrency(displayEmployeeContribution(a))}</div>
                        {a.employer_match_pct > 0 && (
                          <>
                            <div><strong>Employer:</strong> {formatCurrency(displayEmployerContribution(a))}</div>
                            <div><strong>Total:</strong> {formatCurrency(displayTotalContribution(a))}</div>
                          </>
                        )}
                      </div>
                    </td>
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
              {['401k','403b','roth_401k'].includes(form.account_type) ? (
                <>
                  <FormField label="Employee Contribution (% of salary)">
                    <input type="number" step="0.1" min="0" max="100" value={form.contribution_pct} onChange={e => set('contribution_pct', +e.target.value)} placeholder="e.g. 4" />
                  </FormField>
                  <FormField label="Employee Contribution ($/yr) — override if not using %">
                    <input type="number" step="0.01" min="0" value={form.annual_contribution} onChange={e => set('annual_contribution', +e.target.value)} disabled={form.contribution_pct > 0} style={form.contribution_pct > 0 ? { opacity: 0.4 } : {}} />
                  </FormField>
                  <FormField label="Employer Match (% of your salary)">
                    <input type="number" step="0.1" min="0" max="100" value={form.employer_match_pct} onChange={e => set('employer_match_pct', +e.target.value)} placeholder="e.g. 2" />
                  </FormField>
                  <FormField label="Min. employee contribution to get full match (% of salary)">
                    <input type="number" step="0.1" min="0" max="100" value={form.employer_match_limit_pct} onChange={e => set('employer_match_limit_pct', +e.target.value)} placeholder="e.g. 4" />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="Employee Contribution ($/yr)">
                    <input type="number" step="0.01" min="0" value={form.annual_contribution} onChange={e => set('annual_contribution', +e.target.value)} />
                  </FormField>
                  <FormField label="Employer Match (%)">
                    <input type="number" step="0.1" min="0" max="100" value={form.employer_match_pct} onChange={e => set('employer_match_pct', +e.target.value)} />
                  </FormField>
                  <FormField label="Match Limit (% of salary)">
                    <input type="number" step="0.1" min="0" max="100" value={form.employer_match_limit_pct} onChange={e => set('employer_match_limit_pct', +e.target.value)} />
                  </FormField>
                </>
              )}
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
