import { useState, useEffect } from 'react'
import { getScenarios, createScenario, updateScenario, deleteScenario, getScenarioOverrides, createScenarioOverride, deleteScenarioOverride } from '../api'
import { FormField, Modal, EmptyState } from '../components/shared'

const BLANK_SCENARIO = { name: '', description: '', is_base: false }
const OVERRIDE_TYPES = ['return_override','contribution_override','expense_override','income_override','retirement_age_override']

export default function Scenarios() {
  const [scenarios, setScenarios] = useState([])
  const [selected, setSelected] = useState(null)
  const [overrides, setOverrides] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(BLANK_SCENARIO)
  const [ovForm, setOvForm] = useState({ override_type: 'return_override', account_id: '', age_start: '', age_end: '', value: 0, description: '' })
  const [error, setError] = useState('')

  const load = () => getScenarios().then(setScenarios)
  useEffect(() => { load() }, [])

  const loadOverrides = id => getScenarioOverrides(id).then(setOverrides)
  const select = id => { setSelected(id); loadOverrides(id) }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setOv = (k, v) => setOvForm(f => ({ ...f, [k]: v }))

  const submitScenario = async e => {
    e.preventDefault(); setError('')
    try {
      if (modal === 'add') await createScenario(form)
      else await updateScenario(modal.editId, form)
      await load(); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const removeScenario = async id => {
    if (!confirm('Delete this scenario?')) return
    await deleteScenario(id); load(); if (selected === id) setSelected(null)
  }

  const submitOverride = async e => {
    e.preventDefault(); setError('')
    const payload = {
      ...ovForm,
      account_id: ovForm.account_id === '' ? null : +ovForm.account_id,
      age_start: ovForm.age_start === '' ? null : +ovForm.age_start,
      age_end: ovForm.age_end === '' ? null : +ovForm.age_end,
    }
    try {
      await createScenarioOverride(selected, payload)
      await loadOverrides(selected); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const removeOverride = async id => {
    if (!confirm('Remove this override?')) return
    await deleteScenarioOverride(selected, id); loadOverrides(selected)
  }

  const selScenario = scenarios.find(s => s.id === selected)

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* List */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 className="page-title" style={{ fontSize: 16 }}>Scenarios</h1>
          <button className="btn-primary btn-sm" onClick={() => { setForm(BLANK_SCENARIO); setError(''); setModal('add') }}>+</button>
        </div>
        {scenarios.length === 0
          ? <EmptyState icon="🔀" title="No scenarios" subtitle="Create scenarios to model what-if situations." action={<button className="btn-primary btn-sm" onClick={() => { setForm(BLANK_SCENARIO); setModal('add') }}>Create</button>} />
          : scenarios.map(s => (
            <div key={s.id} onClick={() => select(s.id)}
              style={{ padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, background: selected === s.id ? 'rgba(79,142,247,0.12)' : 'var(--surface)', border: `1px solid ${selected === s.id ? 'var(--accent)' : 'var(--border)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</div>
                  {s.is_base && <span className="tag" style={{ marginTop: 4 }}>base</span>}
                </div>
                <div>
                  <button className="btn-secondary btn-sm" onClick={ev => { ev.stopPropagation(); setForm({ name: s.name, description: s.description, is_base: s.is_base }); setError(''); setModal({ editId: s.id }) }} style={{ marginRight: 4 }}>✎</button>
                  <button className="btn-danger btn-sm" onClick={ev => { ev.stopPropagation(); removeScenario(s.id) }}>✕</button>
                </div>
              </div>
              {s.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.3 }}>{s.description}</div>}
            </div>
          ))}
      </div>

      {/* Overrides */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected
          ? <div className="card"><EmptyState icon="👈" title="Select a scenario" subtitle="View and manage parameter overrides." /></div>
          : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{selScenario?.name} — Overrides</h2>
                <button className="btn-primary btn-sm" onClick={() => { setOvForm({ override_type: 'return_override', account_id: '', age_start: '', age_end: '', value: 0, description: '' }); setError(''); setModal('add-ov') }}>+ Add Override</button>
              </div>
              <div className="card">
                {overrides.length === 0
                  ? <EmptyState icon="⚙️" title="No overrides" subtitle="Overrides let you change returns, contributions, expenses, or income for specific ages. Without overrides, the base plan values are used." />
                  : (
                    <table>
                      <thead><tr><th>Type</th><th>Account ID</th><th>Age Range</th><th>Value</th><th>Description</th><th></th></tr></thead>
                      <tbody>
                        {overrides.map(o => (
                          <tr key={o.id}>
                            <td><span className="tag">{o.override_type.replace('_override','')}</span></td>
                            <td style={{ color: 'var(--text-muted)' }}>{o.account_id ?? '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{o.age_start ?? '—'}–{o.age_end ?? '∞'}</td>
                            <td>{o.value}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{o.description}</td>
                            <td><button className="btn-danger btn-sm" onClick={() => removeOverride(o.id)}>Del</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            </>
          )}
      </div>

      {(modal === 'add' || modal?.editId) && (
        <Modal title={modal === 'add' ? 'Create Scenario' : 'Edit Scenario'} onClose={() => setModal(null)}
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" form="sc-form" type="submit">Save</button></>}>
          <form id="sc-form" onSubmit={submitScenario}>
            <div className="form-grid">
              <FormField label="Scenario Name" fullWidth><input value={form.name} onChange={e => set('name', e.target.value)} required /></FormField>
              <FormField label="Description" fullWidth><input value={form.description || ''} onChange={e => set('description', e.target.value)} /></FormField>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" id="base-sc" style={{ width: 'auto' }} checked={form.is_base} onChange={e => set('is_base', e.target.checked)} />
                <label htmlFor="base-sc" style={{ marginBottom: 0 }}>Mark as base scenario</label>
              </div>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}

      {modal === 'add-ov' && (
        <Modal title="Add Override" onClose={() => setModal(null)}
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" form="ov-form" type="submit">Save</button></>}>
          <form id="ov-form" onSubmit={submitOverride}>
            <div className="form-grid">
              <FormField label="Override Type" fullWidth>
                <select value={ovForm.override_type} onChange={e => setOv('override_type', e.target.value)}>
                  {OVERRIDE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Account ID (optional — for return overrides)">
                <input type="number" value={ovForm.account_id} onChange={e => setOv('account_id', e.target.value)} placeholder="leave blank = all accounts" />
              </FormField>
              <FormField label="Age Start"><input type="number" value={ovForm.age_start} onChange={e => setOv('age_start', e.target.value)} /></FormField>
              <FormField label="Age End"><input type="number" value={ovForm.age_end} onChange={e => setOv('age_end', e.target.value)} /></FormField>
              <FormField label="Value (% for returns, $ for income/expenses)">
                <input type="number" step="any" value={ovForm.value} onChange={e => setOv('value', +e.target.value)} required />
              </FormField>
              <FormField label="Description" fullWidth>
                <input value={ovForm.description || ''} onChange={e => setOv('description', e.target.value)} />
              </FormField>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}
    </div>
  )
}
