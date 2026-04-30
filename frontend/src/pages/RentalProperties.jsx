import { useState, useEffect } from 'react'
import {
  getRentalProperties, createRentalProperty, updateRentalProperty, deleteRentalProperty,
  getMortgages, createMortgage, updateMortgage, deleteMortgage,
  getRentalIncome, createRentalIncome, updateRentalIncome,
  getRentalExpenses, createRentalExpense, updateRentalExpense, deleteRentalExpense,
} from '../api'
import { FormField, Modal, EmptyState, formatCurrency } from '../components/shared'

const PROP_BLANK = {
  name: '', purchase_date: '', purchase_price: 0, land_value: 0, building_value: 0,
  current_market_value: 0, appreciation_rate_pct: 3.0, property_type: 'residential_single',
  status: 'active', planned_sale_year: '', expected_sale_price: '', closing_cost_pct: 7.0,
  active_participation: true, is_primary_residence: false, notes: '',
}

const EXP_CATS = ['property_tax','insurance','maintenance','hoa','management_fee','utilities','other']

export default function RentalProperties() {
  const [properties, setProperties] = useState([])
  const [selected, setSelected] = useState(null)  // currently viewed property id
  const [mortgages, setMortgages] = useState([])
  const [incomeRows, setIncomeRows] = useState([])
  const [expenseRows, setExpenseRows] = useState([])
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(PROP_BLANK)
  const [subForm, setSubForm] = useState({})
  const [error, setError] = useState('')

  const loadProps = () => getRentalProperties().then(setProperties)
  useEffect(() => { loadProps() }, [])

  const loadDetails = async id => {
    const [m, inc, exp] = await Promise.all([
      getMortgages(id), getRentalIncome(id), getRentalExpenses(id),
    ])
    setMortgages(m); setIncomeRows(inc); setExpenseRows(exp)
  }

  const selectProp = async id => {
    setSelected(id); setTab('overview')
    await loadDetails(id)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setSub = (k, v) => setSubForm(f => ({ ...f, [k]: v }))

  const openAddProp = () => { setForm(PROP_BLANK); setError(''); setModal('add-prop') }
  const openEditProp = p => { setForm({ ...p, planned_sale_year: p.planned_sale_year ?? '', expected_sale_price: p.expected_sale_price ?? '' }); setError(''); setModal('edit-prop') }

  const submitProp = async e => {
    e.preventDefault(); setError('')
    const payload = {
      ...form,
      planned_sale_year: form.planned_sale_year === '' ? null : +form.planned_sale_year,
      expected_sale_price: form.expected_sale_price === '' ? null : +form.expected_sale_price,
    }
    try {
      if (modal === 'add-prop') { const p = await createRentalProperty(payload); await loadProps(); setSelected(p.id); await loadDetails(p.id) }
      else { await updateRentalProperty(selected, payload); await loadProps(); await loadDetails(selected) }
      setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const deleteProp = async () => {
    if (!confirm('Delete this property and all its data?')) return
    await deleteRentalProperty(selected); setSelected(null); loadProps()
  }

  // Mortgage
  const openAddMort = () => { setSubForm({ lender: '', original_amount: 0, interest_rate: 0, term_years: 30, start_date: '', current_balance: 0, current_balance_date: '', extra_monthly_payment: 0, notes: '' }); setError(''); setModal('add-mort') }
  const submitMort = async e => {
    e.preventDefault(); setError('')
    const payload = { ...subForm, current_balance_date: subForm.current_balance_date || null }
    try {
      if (modal === 'add-mort') await createMortgage(selected, payload)
      else await updateMortgage(selected, modal.editId, payload)
      await loadDetails(selected); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  // Rental income
  const openAddInc = () => { setSubForm({ monthly_rent: 0, vacancy_rate_pct: 5, annual_rent_increase_pct: 3, start_date: '', notes: '' }); setError(''); setModal('add-inc') }
  const openEditInc = row => { setSubForm({ ...row }); setError(''); setModal({ editInc: row.id }) }
  const submitInc = async e => {
    e.preventDefault(); setError('')
    const payload = { ...subForm, start_date: subForm.start_date || null }
    try {
      if (modal === 'add-inc') await createRentalIncome(selected, payload)
      else await updateRentalIncome(selected, modal.editInc, payload)
      await loadDetails(selected); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  // Rental expenses
  const openAddExp = () => { setSubForm({ name: '', category: 'property_tax', annual_amount: 0, inflation_adjusted: true, notes: '' }); setError(''); setModal('add-exp') }
  const openEditExp = row => { setSubForm({ ...row }); setError(''); setModal({ editExp: row.id }) }
  const submitExp = async e => {
    e.preventDefault(); setError('')
    try {
      if (modal === 'add-exp') await createRentalExpense(selected, subForm)
      else await updateRentalExpense(selected, modal.editExp, subForm)
      await loadDetails(selected); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }
  const removeExp = async id => { if (!confirm('Delete?')) return; await deleteRentalExpense(selected, id); loadDetails(selected) }

  const prop = properties.find(p => p.id === selected)
  const mortgage = mortgages[0]
  const income = incomeRows[0]
  const totalOpEx = expenseRows.reduce((s, e) => s + e.annual_amount, 0)

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* Property list */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 className="page-title" style={{ fontSize: 16 }}>Properties</h1>
          <button className="btn-primary btn-sm" onClick={openAddProp}>+</button>
        </div>
        {properties.length === 0
          ? <EmptyState icon="🏠" title="No properties" action={<button className="btn-primary btn-sm" onClick={openAddProp}>Add</button>} />
          : properties.map(p => (
            <div
              key={p.id}
              onClick={() => selectProp(p.id)}
              style={{
                padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selected === p.id ? 'rgba(79,142,247,0.12)' : 'var(--surface)',
                border: `1px solid ${selected === p.id ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}{p.is_primary_residence && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>HOME</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatCurrency(p.current_market_value)}</div>
            </div>
          ))}
      </div>

      {/* Property detail */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected
          ? <div className="card"><EmptyState icon="👈" title="Select a property" subtitle="Or add a new one to get started." /></div>
          : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{prop?.name}</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary btn-sm" onClick={() => openEditProp(prop)}>Edit Property</button>
                  <button className="btn-danger btn-sm" onClick={deleteProp}>Delete</button>
                </div>
              </div>

              <div className="tab-group">
                {['overview','mortgage',...(prop?.is_primary_residence ? [] : ['rental income','expenses'])].map(t => (
                  <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
                ))}
              </div>

              {tab === 'overview' && prop && (
                <div className="card">
                  {prop.is_primary_residence && (
                    <div style={{ marginBottom: 12, display: 'inline-block', padding: '3px 10px', borderRadius: 4, background: 'rgba(79,142,247,0.15)', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Primary Residence</div>
                  )}
                  <div className="form-grid three-col">
                    <div><div className="stat-label">Purchase Price</div><div style={{ fontWeight: 600 }}>{formatCurrency(prop.purchase_price)}</div></div>
                    <div><div className="stat-label">Land Value</div><div style={{ fontWeight: 600 }}>{formatCurrency(prop.land_value)}</div></div>
                    <div><div className="stat-label">Building Value</div><div style={{ fontWeight: 600 }}>{formatCurrency(prop.building_value)}</div></div>
                    <div><div className="stat-label">Current Market Value</div><div style={{ fontWeight: 600, color: 'var(--accent)' }}>{formatCurrency(prop.current_market_value)}</div></div>
                    <div><div className="stat-label">Annual Appreciation</div><div style={{ fontWeight: 600 }}>{prop.appreciation_rate_pct}%</div></div>
                    {!prop.is_primary_residence && <div><div className="stat-label">Monthly Gross Rent</div><div style={{ fontWeight: 600, color: 'var(--green)' }}>{formatCurrency(income?.monthly_rent ?? 0)}</div></div>}
                    <div><div className="stat-label">Mortgage Balance</div><div style={{ fontWeight: 600, color: 'var(--red)' }}>{formatCurrency(mortgage?.current_balance ?? 0)}</div></div>
                    <div><div className="stat-label">Equity</div><div style={{ fontWeight: 600, color: 'var(--green)' }}>{formatCurrency((prop.current_market_value || 0) - (mortgage?.current_balance || 0))}</div></div>
                    {!prop.is_primary_residence && <div><div className="stat-label">Annual Op. Expenses</div><div style={{ fontWeight: 600 }}>{formatCurrency(totalOpEx)}</div></div>}
                  </div>
                  {prop.planned_sale_year && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
                      📅 Planned sale in <strong>{prop.planned_sale_year}</strong> for {formatCurrency(prop.expected_sale_price ?? 0)} ({prop.closing_cost_pct}% closing costs)
                    </div>
                  )}
                </div>
              )}

              {tab === 'mortgage' && (
                <div className="card">
                  {mortgage ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Mortgage Details</h3>
                        <button className="btn-secondary btn-sm" onClick={() => { setSubForm({ ...mortgage }); setModal({ editId: mortgage.id }) }}>Edit</button>
                      </div>
                      <div className="form-grid">
                        <div><div className="stat-label">Lender</div><div>{mortgage.lender || '—'}</div></div>
                        <div><div className="stat-label">Original Amount</div><div>{formatCurrency(mortgage.original_amount)}</div></div>
                        <div><div className="stat-label">Interest Rate</div><div>{mortgage.interest_rate}%</div></div>
                        <div><div className="stat-label">Term</div><div>{mortgage.term_years} years</div></div>
                        <div><div className="stat-label">Current Balance</div><div style={{ color: 'var(--red)' }}>{formatCurrency(mortgage.current_balance)}</div></div>
                        <div><div className="stat-label">Extra Monthly</div><div>{formatCurrency(mortgage.extra_monthly_payment)}</div></div>
                      </div>
                    </>
                  ) : (
                    <EmptyState icon="🏦" title="No mortgage" subtitle="Add mortgage details if applicable." action={<button className="btn-primary btn-sm" onClick={openAddMort}>Add Mortgage</button>} />
                  )}
                  {!mortgage && <button className="btn-primary" onClick={openAddMort} style={{ marginTop: 12 }}>Add Mortgage</button>}
                </div>
              )}

              {tab === 'rental income' && (
                <div className="card">
                  {income ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Rental Income</h3>
                        <button className="btn-secondary btn-sm" onClick={() => openEditInc(income)}>Edit</button>
                      </div>
                      <div className="form-grid">
                        <div><div className="stat-label">Monthly Rent</div><div style={{ color: 'var(--green)', fontWeight: 600 }}>{formatCurrency(income.monthly_rent)}</div></div>
                        <div><div className="stat-label">Annual Gross</div><div style={{ color: 'var(--green)', fontWeight: 600 }}>{formatCurrency(income.monthly_rent * 12)}</div></div>
                        <div><div className="stat-label">Vacancy Rate</div><div>{income.vacancy_rate_pct}%</div></div>
                        <div><div className="stat-label">Annual Net</div><div style={{ color: 'var(--green)', fontWeight: 600 }}>{formatCurrency(income.monthly_rent * 12 * (1 - income.vacancy_rate_pct / 100))}</div></div>
                        <div><div className="stat-label">Annual Rent Increase</div><div>{income.annual_rent_increase_pct}%/yr</div></div>
                      </div>
                    </>
                  ) : (
                    <EmptyState icon="💰" title="No rental income set" action={<button className="btn-primary btn-sm" onClick={openAddInc}>Add</button>} />
                  )}
                  {!income && <button className="btn-primary" onClick={openAddInc} style={{ marginTop: 12 }}>Add Rental Income</button>}
                </div>
              )}

              {tab === 'expenses' && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600 }}>Operating Expenses — {formatCurrency(totalOpEx)}/yr</h3>
                    <button className="btn-primary btn-sm" onClick={openAddExp}>+ Add</button>
                  </div>
                  {expenseRows.length === 0
                    ? <EmptyState icon="💸" title="No operating expenses" />
                    : (
                      <table>
                        <thead><tr><th>Name</th><th>Category</th><th>Annual</th><th>Infl.</th><th></th></tr></thead>
                        <tbody>
                          {expenseRows.map(e => (
                            <tr key={e.id}>
                              <td>{e.name}</td>
                              <td><span className="tag">{e.category}</span></td>
                              <td>{formatCurrency(e.annual_amount)}</td>
                              <td>{e.inflation_adjusted ? '✓' : '—'}</td>
                              <td>
                                <button className="btn-secondary btn-sm" onClick={() => openEditExp(e)} style={{ marginRight: 4 }}>Edit</button>
                                <button className="btn-danger btn-sm" onClick={() => removeExp(e.id)}>Del</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              )}
            </>
          )}
      </div>

      {/* Modals */}
      {(modal === 'add-prop' || modal === 'edit-prop') && (
        <Modal title={modal === 'add-prop' ? 'Add Rental Property' : 'Edit Property'} onClose={() => setModal(null)}
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" form="prop-form" type="submit">Save</button></>}>
          <form id="prop-form" onSubmit={submitProp}>
            <div className="form-grid">
              <FormField label="Property Name" fullWidth><input value={form.name} onChange={e => set('name', e.target.value)} required /></FormField>
              <FormField label="Purchase Date"><input type="date" value={form.purchase_date?.split('T')[0] || form.purchase_date} onChange={e => set('purchase_date', e.target.value)} required /></FormField>
              <FormField label="Purchase Price ($)"><input type="number" min="0" step="1" value={form.purchase_price} onChange={e => set('purchase_price', +e.target.value)} /></FormField>
              <FormField label="Land Value ($)"><input type="number" min="0" step="1" value={form.land_value} onChange={e => set('land_value', +e.target.value)} /></FormField>
              <FormField label="Building Value ($)"><input type="number" min="0" step="1" value={form.building_value} onChange={e => set('building_value', +e.target.value)} /></FormField>
              <FormField label="Current Market Value ($)"><input type="number" min="0" step="1" value={form.current_market_value} onChange={e => set('current_market_value', +e.target.value)} /></FormField>
              <FormField label="Appreciation Rate (%/yr)"><input type="number" step="0.1" value={form.appreciation_rate_pct} onChange={e => set('appreciation_rate_pct', +e.target.value)} /></FormField>
              <FormField label="Property Type">
                <select value={form.property_type} onChange={e => set('property_type', e.target.value)}>
                  {['residential_single','residential_multi','condo','commercial'].map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Status">
                <select value={form.status} onChange={e => set('status', e.target.value)}>
                  {['active','planned','sold'].map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Planned Sale Year"><input type="number" value={form.planned_sale_year} onChange={e => set('planned_sale_year', e.target.value)} /></FormField>
              <FormField label="Expected Sale Price ($)"><input type="number" min="0" value={form.expected_sale_price} onChange={e => set('expected_sale_price', e.target.value)} /></FormField>
              <FormField label="Closing Costs (%)"><input type="number" step="0.1" min="0" max="30" value={form.closing_cost_pct} onChange={e => set('closing_cost_pct', +e.target.value)} /></FormField>
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="primary-res" style={{ width: 'auto' }} checked={!!form.is_primary_residence} onChange={e => set('is_primary_residence', e.target.checked)} />
              <label htmlFor="primary-res" style={{ marginBottom: 0, fontSize: 13 }}>This is my primary residence (no rental income or depreciation)</label>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}

      {(modal === 'add-mort' || modal?.editId) && (
        <Modal title="Mortgage Details" onClose={() => setModal(null)}
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" form="mort-form" type="submit">Save</button></>}>
          <form id="mort-form" onSubmit={submitMort}>
            <div className="form-grid">
              <FormField label="Lender" fullWidth><input value={subForm.lender || ''} onChange={e => setSub('lender', e.target.value)} /></FormField>
              <FormField label="Original Loan Amount ($)"><input type="number" min="0" value={subForm.original_amount} onChange={e => setSub('original_amount', +e.target.value)} /></FormField>
              <FormField label="Interest Rate (%)"><input type="number" step="0.01" min="0" value={subForm.interest_rate} onChange={e => setSub('interest_rate', +e.target.value)} /></FormField>
              <FormField label="Term (years)"><input type="number" min="1" max="50" value={subForm.term_years} onChange={e => setSub('term_years', +e.target.value)} /></FormField>
              <FormField label="Loan Start Date"><input type="date" value={subForm.start_date?.split('T')[0] || subForm.start_date || ''} onChange={e => setSub('start_date', e.target.value)} required /></FormField>
              <FormField label="Current Balance ($)"><input type="number" min="0" value={subForm.current_balance} onChange={e => setSub('current_balance', +e.target.value)} /></FormField>
              <FormField label="Balance Date (if not now)"><input type="date" value={subForm.current_balance_date?.split('T')[0] || ''} onChange={e => setSub('current_balance_date', e.target.value)} /></FormField>
              <FormField label="Extra Monthly Payment ($)"><input type="number" min="0" value={subForm.extra_monthly_payment} onChange={e => setSub('extra_monthly_payment', +e.target.value)} /></FormField>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}

      {(modal === 'add-inc' || modal?.editInc) && (
        <Modal title="Rental Income" onClose={() => setModal(null)}
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" form="inc-form" type="submit">Save</button></>}>
          <form id="inc-form" onSubmit={submitInc}>
            <div className="form-grid">
              <FormField label="Monthly Rent ($)"><input type="number" min="0" value={subForm.monthly_rent} onChange={e => setSub('monthly_rent', +e.target.value)} /></FormField>
              <FormField label="Vacancy Rate (%)"><input type="number" step="0.1" min="0" max="100" value={subForm.vacancy_rate_pct} onChange={e => setSub('vacancy_rate_pct', +e.target.value)} /></FormField>
              <FormField label="Annual Rent Increase (%)"><input type="number" step="0.1" value={subForm.annual_rent_increase_pct} onChange={e => setSub('annual_rent_increase_pct', +e.target.value)} /></FormField>
              <FormField label="Start Date"><input type="date" value={subForm.start_date?.split('T')[0] || ''} onChange={e => setSub('start_date', e.target.value)} /></FormField>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}

      {(modal === 'add-exp' || modal?.editExp) && (
        <Modal title="Operating Expense" onClose={() => setModal(null)}
          footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" form="rexp-form" type="submit">Save</button></>}>
          <form id="rexp-form" onSubmit={submitExp}>
            <div className="form-grid">
              <FormField label="Name" fullWidth><input value={subForm.name || ''} onChange={e => setSub('name', e.target.value)} required /></FormField>
              <FormField label="Category">
                <select value={subForm.category} onChange={e => setSub('category', e.target.value)}>
                  {EXP_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="Annual Amount ($)"><input type="number" min="0" value={subForm.annual_amount} onChange={e => setSub('annual_amount', +e.target.value)} /></FormField>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                <input type="checkbox" id="re-infl" style={{ width: 'auto' }} checked={subForm.inflation_adjusted} onChange={e => setSub('inflation_adjusted', e.target.checked)} />
                <label htmlFor="re-infl" style={{ marginBottom: 0 }}>Inflation-adjusted</label>
              </div>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </Modal>
      )}
    </div>
  )
}
