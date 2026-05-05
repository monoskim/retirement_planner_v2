import { useState, useEffect } from 'react'
import {
  getScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  getScenarioOverrides,
  createScenarioOverride,
  deleteScenarioOverride,
  getProfile,
  getAccounts,
  getIncomeSources,
  getExpenses,
  getSocialSecurity,
  getRentalProperties,
} from '../api'
import { FormField, Modal, EmptyState } from '../components/shared'

const BLANK_SCENARIO = { name: '', description: '', is_base: false }

const PROFILE_FIELDS = [
  { name: 'retirement_age', label: 'Retirement Age', type: 'number' },
  { name: 'life_expectancy', label: 'Life Expectancy', type: 'number' },
  { name: 'inflation_rate', label: 'Inflation Rate (%)', type: 'number' },
  { name: 'filing_status', label: 'Filing Status', type: 'text' },
]

const ACCOUNT_FIELDS = [
  { name: 'annual_contribution', label: 'Annual Contribution ($)', type: 'number' },
  { name: 'contribution_pct', label: 'Contribution (% of salary)', type: 'number' },
  { name: 'employer_match_pct', label: 'Employer Match (%)', type: 'number' },
  { name: 'employer_match_limit_pct', label: 'Match Limit (% of salary)', type: 'number' },
  { name: 'expected_return_pct', label: 'Expected Return (%)', type: 'number' },
  { name: 'return_stddev_pct', label: 'Return Std Dev (%)', type: 'number' },
]

const INCOME_FIELDS = [
  { name: 'annual_amount', label: 'Annual Amount ($)', type: 'number' },
  { name: 'start_age', label: 'Start Age', type: 'nullableNumber' },
  { name: 'end_age', label: 'End Age', type: 'nullableNumber' },
  { name: 'inflation_adjusted', label: 'Inflation Adjusted', type: 'boolean' },
  { name: 'tax_treatment', label: 'Tax Treatment', type: 'text' },
]

const EXPENSE_FIELDS = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'category', label: 'Category', type: 'text' },
  { name: 'annual_amount', label: 'Annual Amount ($)', type: 'number' },
  { name: 'start_age', label: 'Start Age', type: 'nullableNumber' },
  { name: 'end_age', label: 'End Age', type: 'nullableNumber' },
  { name: 'inflation_adjusted', label: 'Inflation Adjusted', type: 'boolean' },
]

const SCENARIO_EXPENSE_PREFIX = 'scenario-expense:'
const EXPENSE_DELETED_FIELD = '__deleted__'

const makeScenarioExpenseId = () => `${SCENARIO_EXPENSE_PREFIX}${globalThis.crypto?.randomUUID?.() || Date.now()}`

const SS_FIELDS = [
  { name: 'fra_monthly_benefit', label: 'FRA Monthly Benefit ($)', type: 'number' },
  { name: 'fra_age', label: 'FRA Age', type: 'number' },
  { name: 'claiming_age', label: 'Claiming Age', type: 'number' },
  { name: 'spouse_fra_monthly_benefit', label: 'Spouse FRA Monthly Benefit ($)', type: 'number' },
  { name: 'spouse_fra_age', label: 'Spouse FRA Age', type: 'number' },
  { name: 'spouse_claiming_age', label: 'Spouse Claiming Age', type: 'nullableNumber' },
]

const RENTAL_FIELDS = [
  { name: 'current_market_value', label: 'Current Market Value ($)', type: 'number' },
  { name: 'appreciation_rate_pct', label: 'Appreciation Rate (%)', type: 'number' },
  { name: 'status', label: 'Status', type: 'text' },
  { name: 'planned_sale_year', label: 'Planned Sale Year', type: 'nullableNumber' },
  { name: 'expected_sale_price', label: 'Expected Sale Price ($)', type: 'nullableNumber' },
  { name: 'closing_cost_pct', label: 'Closing Cost (%)', type: 'number' },
]

const FIELD_MAP = {
  profile: PROFILE_FIELDS,
  account: ACCOUNT_FIELDS,
  income: INCOME_FIELDS,
  expense: EXPENSE_FIELDS,
  social_security: SS_FIELDS,
  rental_property: RENTAL_FIELDS,
}

const BASE_DATA = {
  profile: null,
  accounts: [],
  income_sources: [],
  expenses: [],
  social_security: null,
  rental_properties: [],
}

const deepClone = value => JSON.parse(JSON.stringify(value))

const overrideKey = (entityType, entityId, fieldName) => `${entityType}|${entityId}|${fieldName}`

const parseOverrideValue = raw => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const normalizeCompare = value => (value === undefined ? null : value)

const valuesEqual = (a, b) => JSON.stringify(normalizeCompare(a)) === JSON.stringify(normalizeCompare(b))

const applyOverridesToBase = (baseData, overrides) => {
  const next = deepClone(baseData)
  overrides.forEach(ov => {
    const value = parseOverrideValue(ov.override_value)
    const { entity_type: etype, entity_id: eid, field_name: field } = ov

    if (etype === 'profile' && next.profile) {
      next.profile[field] = value
      return
    }

    if (etype === 'social_security' && next.social_security) {
      next.social_security[field] = value
      return
    }

    if (etype === 'account') {
      const row = next.accounts.find(acc => acc.id === eid)
      if (row) row[field] = value
      return
    }

    if (etype === 'income') {
      const row = next.income_sources.find(src => src.id === eid)
      if (row) row[field] = value
      return
    }

    if (etype === 'expense') {
      if (field === EXPENSE_DELETED_FIELD && value === true) {
        next.expenses = next.expenses.filter(exp => exp.id !== eid)
        return
      }
      let row = next.expenses.find(exp => exp.id === eid)
      if (!row) {
        row = {
          id: eid,
          name: 'Scenario Expense',
          category: 'other',
          annual_amount: 0,
          start_age: null,
          end_age: null,
          inflation_adjusted: true,
          notes: null,
        }
        next.expenses.push(row)
      }
      row[field] = value
      return
    }

    if (etype === 'rental_property') {
      const row = next.rental_properties.find(prop => prop.id === eid)
      if (row) row[field] = value
    }
  })
  return next
}

const toInputValue = value => (value ?? '')

const parseFieldValue = (fieldType, raw) => {
  if (fieldType === 'boolean') return !!raw
  if (fieldType === 'nullableNumber') return raw === '' ? null : Number(raw)
  if (fieldType === 'number') return Number(raw)
  return raw
}

const isManagedOverride = ov => {
  if (ov.entity_type === 'expense' && ov.field_name === 'periods') return true
  if (ov.entity_type === 'expense' && ov.field_name === EXPENSE_DELETED_FIELD) return true
  const fields = FIELD_MAP[ov.entity_type]
  if (!fields) return false
  return fields.some(f => f.name === ov.field_name)
}

const buildManagedOverrides = (baseData, effectiveData) => {
  const rows = []

  PROFILE_FIELDS.forEach(field => {
    if (!baseData.profile || !effectiveData.profile) return
    const b = baseData.profile[field.name]
    const e = effectiveData.profile[field.name]
    if (!valuesEqual(b, e)) {
      rows.push({
        entity_type: 'profile',
        entity_id: 'profile',
        field_name: field.name,
        override_value: JSON.stringify(e),
      })
    }
  })

  ACCOUNT_FIELDS.forEach(field => {
    baseData.accounts.forEach(baseAcc => {
      const effAcc = effectiveData.accounts.find(a => a.id === baseAcc.id)
      if (!effAcc) return
      if (!valuesEqual(baseAcc[field.name], effAcc[field.name])) {
        rows.push({
          entity_type: 'account',
          entity_id: baseAcc.id,
          field_name: field.name,
          override_value: JSON.stringify(effAcc[field.name]),
        })
      }
    })
  })

  INCOME_FIELDS.forEach(field => {
    baseData.income_sources.forEach(baseIncome => {
      const effIncome = effectiveData.income_sources.find(i => i.id === baseIncome.id)
      if (!effIncome) return
      if (!valuesEqual(baseIncome[field.name], effIncome[field.name])) {
        rows.push({
          entity_type: 'income',
          entity_id: baseIncome.id,
          field_name: field.name,
          override_value: JSON.stringify(effIncome[field.name]),
        })
      }
    })
  })

  EXPENSE_FIELDS.forEach(field => {
    baseData.expenses.forEach(baseExpense => {
      const effExpense = effectiveData.expenses.find(e => e.id === baseExpense.id)
      if (!effExpense) return
      const baseValue = baseExpense[field.name]
      const effValue = effExpense[field.name]

      if (!valuesEqual(baseValue, effValue)) {
        rows.push({
          entity_type: 'expense',
          entity_id: baseExpense.id,
          field_name: field.name,
          override_value: JSON.stringify(effValue),
        })
      }
    })
  })

  baseData.expenses.forEach(baseExpense => {
    const stillPresent = effectiveData.expenses.some(e => e.id === baseExpense.id)
    if (!stillPresent) {
      rows.push({
        entity_type: 'expense',
        entity_id: baseExpense.id,
        field_name: EXPENSE_DELETED_FIELD,
        override_value: JSON.stringify(true),
      })
    }
  })

  const baseExpenseIds = new Set(baseData.expenses.map(e => e.id))
  effectiveData.expenses
    .filter(exp => !baseExpenseIds.has(exp.id))
    .forEach(exp => {
      EXPENSE_FIELDS.forEach(field => {
        const value = exp[field.name]

        const isEmpty =
          value === null
          || value === undefined
          || value === ''
          || (Array.isArray(value) && value.length === 0)

        if (isEmpty) return

        rows.push({
          entity_type: 'expense',
          entity_id: exp.id,
          field_name: field.name,
          override_value: JSON.stringify(value),
        })
      })
    })

  SS_FIELDS.forEach(field => {
    if (!baseData.social_security || !effectiveData.social_security) return
    const b = baseData.social_security[field.name]
    const e = effectiveData.social_security[field.name]
    if (!valuesEqual(b, e)) {
      rows.push({
        entity_type: 'social_security',
        entity_id: 'ss',
        field_name: field.name,
        override_value: JSON.stringify(e),
      })
    }
  })

  RENTAL_FIELDS.forEach(field => {
    baseData.rental_properties.forEach(baseProperty => {
      const effProperty = effectiveData.rental_properties.find(p => p.id === baseProperty.id)
      if (!effProperty) return
      if (!valuesEqual(baseProperty[field.name], effProperty[field.name])) {
        rows.push({
          entity_type: 'rental_property',
          entity_id: baseProperty.id,
          field_name: field.name,
          override_value: JSON.stringify(effProperty[field.name]),
        })
      }
    })
  })

  return rows
}

const calcChangedCount = (baseData, effectiveData) => buildManagedOverrides(baseData, effectiveData).length

function renderFieldInput(field, value, onChange) {
  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        style={{ width: 'auto' }}
        checked={!!value}
        onChange={e => onChange(field, e.target.checked)}
      />
    )
  }

  if (field.type === 'number' || field.type === 'nullableNumber') {
    return (
      <input
        type="number"
        step="0.01"
        value={toInputValue(value)}
        onChange={e => onChange(field, e.target.value)}
      />
    )
  }

  return <input value={toInputValue(value)} onChange={e => onChange(field, e.target.value)} />
}

export default function Scenarios() {
  const [scenarios, setScenarios] = useState([])
  const [selected, setSelected] = useState(null)
  const [overrides, setOverrides] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(BLANK_SCENARIO)
  const [baseData, setBaseData] = useState(BASE_DATA)
  const [effectiveData, setEffectiveData] = useState(BASE_DATA)
  const [loadingData, setLoadingData] = useState(true)
  const [savingOverrides, setSavingOverrides] = useState(false)
  const [error, setError] = useState('')

  const loadScenarios = () => getScenarios().then(setScenarios)

  const loadBaseData = async () => {
    const [
      profile,
      accounts,
      incomeSources,
      expenses,
      socialSecurity,
      rentalProperties,
    ] = await Promise.all([
      getProfile().catch(() => null),
      getAccounts().catch(() => []),
      getIncomeSources().catch(() => []),
      getExpenses().catch(() => []),
      getSocialSecurity().catch(() => null),
      getRentalProperties().catch(() => []),
    ])

    return {
      profile,
      accounts,
      income_sources: incomeSources,
      expenses,
      social_security: socialSecurity,
      rental_properties: rentalProperties,
    }
  }

  useEffect(() => {
    Promise.all([loadScenarios(), loadBaseData()])
      .then(([, loadedBase]) => {
        setBaseData(loadedBase)
        setEffectiveData(loadedBase)
      })
      .finally(() => setLoadingData(false))
  }, [])

  const loadOverrides = id => getScenarioOverrides(id).then(rows => {
    setOverrides(rows)
    setEffectiveData(applyOverridesToBase(baseData, rows))
  })

  const select = id => {
    setSelected(id)
    setError('')
    loadOverrides(id)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submitScenario = async e => {
    e.preventDefault(); setError('')
    try {
      if (modal === 'add') await createScenario(form)
      else await updateScenario(modal.editId, form)
      await loadScenarios(); setModal(null)
    } catch (err) { setError(err.response?.data?.detail || 'Save failed') }
  }

  const removeScenario = async id => {
    if (!confirm('Delete this scenario?')) return
    setError('')
    try {
      await deleteScenario(id)
      await loadScenarios()
      if (selected === id) setSelected(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete scenario')
    }
  }

  const saveOverrides = async () => {
    if (!selected) return
    setError('')

    setSavingOverrides(true)
    try {
      const managedDiffs = buildManagedOverrides(baseData, effectiveData)
      const unmanaged = overrides.filter(ov => !isManagedOverride(ov)).map(ov => ({
        entity_type: ov.entity_type,
        entity_id: ov.entity_id,
        field_name: ov.field_name,
        override_value: ov.override_value,
      }))
      const desired = [...unmanaged, ...managedDiffs]

      for (const ov of overrides) {
        await deleteScenarioOverride(selected, ov.id)
      }

      for (const ov of desired) {
        await createScenarioOverride(selected, ov)
      }

      await loadOverrides(selected)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save scenario values')
    } finally {
      setSavingOverrides(false)
    }
  }

  const selScenario = scenarios.find(s => s.id === selected)
  const changedCount = calcChangedCount(baseData, effectiveData)
  const primaryProperties = effectiveData.rental_properties.filter(row => !!row.is_primary_residence)
  const nonPrimaryProperties = effectiveData.rental_properties.filter(row => !row.is_primary_residence)
  const baseExpenseIds = new Set(baseData.expenses.map(e => e.id))

  const updateProfileValue = (field, raw) => {
    setEffectiveData(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        [field.name]: parseFieldValue(field.type, raw),
      },
    }))
  }

  const updateCollectionValue = (collection, id, field, raw) => {
    setEffectiveData(prev => ({
      ...prev,
      [collection]: prev[collection].map(row => (
        row.id === id
          ? { ...row, [field.name]: parseFieldValue(field.type, raw) }
          : row
      )),
    }))
  }

  const addScenarioExpense = () => {
    setEffectiveData(prev => ({
      ...prev,
      expenses: [
        ...prev.expenses,
        {
          id: makeScenarioExpenseId(),
          name: 'Scenario Expense',
          category: 'other',
          annual_amount: 0,
          start_age: null,
          end_age: null,
          inflation_adjusted: true,
          notes: null,
        },
      ],
    }))
  }

  const removeScenarioExpense = expenseId => {
    setEffectiveData(prev => ({
      ...prev,
      expenses: prev.expenses.filter(e => e.id !== expenseId),
    }))
  }

  const updateSocialSecurityValue = (field, raw) => {
    setEffectiveData(prev => ({
      ...prev,
      social_security: {
        ...prev.social_security,
        [field.name]: parseFieldValue(field.type, raw),
      },
    }))
  }

  const resetToBase = () => {
    setEffectiveData(applyOverridesToBase(baseData, []))
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* List */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 className="page-title" style={{ fontSize: 16 }}>Scenarios</h1>
          <button className="btn-primary btn-sm" onClick={() => { setForm(BLANK_SCENARIO); setError(''); setModal('add') }}>+</button>
        </div>
        {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}
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
          ? <div className="card"><EmptyState icon="👈" title="Select a scenario" subtitle="Edit base values directly and save only changed fields as scenario overrides." /></div>
          : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{selScenario?.name} — Scenario Values</h2>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{changedCount} changed field{changedCount === 1 ? '' : 's'} from base</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary btn-sm" onClick={resetToBase}>Reset To Base</button>
                  <button className="btn-primary btn-sm" onClick={saveOverrides} disabled={savingOverrides}>{savingOverrides ? 'Saving…' : 'Save Scenario Values'}</button>
                </div>
              </div>

              {loadingData
                ? <div className="card"><p>Loading base planning data…</p></div>
                : (
                  <>
                    <div className="card" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Profile</h3>
                      {!effectiveData.profile
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No profile found yet.</p>
                        : (
                          <div className="form-grid">
                            {PROFILE_FIELDS.map(field => (
                              <FormField key={field.name} label={field.label}>
                                {renderFieldInput(field, effectiveData.profile[field.name], updateProfileValue)}
                              </FormField>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Accounts</h3>
                      {effectiveData.accounts.length === 0
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No accounts to override.</p>
                        : (
                          <table>
                            <thead>
                              <tr>
                                <th>Account</th>
                                {ACCOUNT_FIELDS.map(f => <th key={f.name}>{f.label}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {effectiveData.accounts.map(acc => (
                                <tr key={acc.id}>
                                  <td>{acc.name}</td>
                                  {ACCOUNT_FIELDS.map(field => (
                                    <td key={overrideKey('account', acc.id, field.name)}>
                                      {renderFieldInput(field, acc[field.name], (f, raw) => updateCollectionValue('accounts', acc.id, f, raw))}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Income Sources</h3>
                      {effectiveData.income_sources.length === 0
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No income sources to override.</p>
                        : (
                          <table>
                            <thead>
                              <tr>
                                <th>Income Source</th>
                                {INCOME_FIELDS.map(f => <th key={f.name}>{f.label}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {effectiveData.income_sources.map(row => (
                                <tr key={row.id}>
                                  <td>{row.name}</td>
                                  {INCOME_FIELDS.map(field => (
                                    <td key={overrideKey('income', row.id, field.name)}>
                                      {renderFieldInput(field, row[field.name], (f, raw) => updateCollectionValue('income_sources', row.id, f, raw))}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Expenses</h3>
                        <button type="button" className="btn-secondary btn-sm" onClick={addScenarioExpense}>+ Add Scenario Expense</button>
                      </div>
                      {effectiveData.expenses.length === 0
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No expenses to override.</p>
                        : (
                          <table>
                            <thead>
                              <tr>
                                {EXPENSE_FIELDS.map(f => <th key={f.name}>{f.label}</th>)}
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {effectiveData.expenses.map(row => (
                                <tr key={row.id}>
                                  {EXPENSE_FIELDS.map(field => (
                                    <td key={overrideKey('expense', row.id, field.name)}>
                                      {(baseExpenseIds.has(row.id) && (field.name === 'name' || field.name === 'category'))
                                          ? <span style={{ color: 'var(--text-muted)' }}>{row[field.name] ?? '—'}</span>
                                          : (field.name === 'name' && !baseExpenseIds.has(row.id))
                                            ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <input
                                                  value={toInputValue(row[field.name])}
                                                  onChange={e => updateCollectionValue('expenses', row.id, field, e.target.value)}
                                                />
                                                <span className="tag">scenario-only</span>
                                              </div>
                                            )
                                          : renderFieldInput(field, row[field.name], (f, raw) => updateCollectionValue('expenses', row.id, f, raw))}
                                    </td>
                                  ))}
                                  <td>
                                    <button
                                      type="button"
                                      className="btn-danger btn-sm"
                                      onClick={() => removeScenarioExpense(row.id)}
                                    >
                                      Del
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Social Security</h3>
                      {!effectiveData.social_security
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No Social Security setup found yet.</p>
                        : (
                          <div className="form-grid">
                            {SS_FIELDS.map(field => (
                              <FormField key={field.name} label={field.label}>
                                {renderFieldInput(field, effectiveData.social_security[field.name], updateSocialSecurityValue)}
                              </FormField>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Primary Residence</h3>
                      {primaryProperties.length === 0
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No primary residence found.</p>
                        : (
                          <table>
                            <thead>
                              <tr>
                                <th>Property</th>
                                {RENTAL_FIELDS.map(f => <th key={f.name}>{f.label}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {primaryProperties.map(row => (
                                <tr key={row.id}>
                                  <td>{row.name}</td>
                                  {RENTAL_FIELDS.map(field => (
                                    <td key={overrideKey('rental_property', row.id, field.name)}>
                                      {renderFieldInput(field, row[field.name], (f, raw) => updateCollectionValue('rental_properties', row.id, f, raw))}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 16 }}>
                      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Rental Properties</h3>
                      {nonPrimaryProperties.length === 0
                        ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No rental properties to override.</p>
                        : (
                          <table>
                            <thead>
                              <tr>
                                <th>Property</th>
                                {RENTAL_FIELDS.map(f => <th key={f.name}>{f.label}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {nonPrimaryProperties.map(row => (
                                <tr key={row.id}>
                                  <td>{row.name}</td>
                                  {RENTAL_FIELDS.map(field => (
                                    <td key={overrideKey('rental_property', row.id, field.name)}>
                                      {renderFieldInput(field, row[field.name], (f, raw) => updateCollectionValue('rental_properties', row.id, f, raw))}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>
                  </>
                )}

              <div className="card">
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Raw Override Rows</h3>
                {overrides.length === 0
                  ? <p style={{ margin: 0, color: 'var(--text-muted)' }}>No override rows currently stored for this scenario.</p>
                  : (
                    <table>
                      <thead><tr><th>Entity</th><th>Field</th><th>Value</th></tr></thead>
                      <tbody>
                        {overrides.map(o => (
                          <tr key={o.id}>
                            <td><span className="tag">{o.entity_type}</span> {o.entity_id !== 'profile' && o.entity_id !== 'ss' && `(${o.entity_id})`}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{o.field_name}</td>
                            <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{o.override_value}</td>
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
    </div>
  )
}
