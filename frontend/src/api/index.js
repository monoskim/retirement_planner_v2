import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ---------- Profile ----------
export const getProfile = () => api.get('/profile').then(r => r.data)
export const saveProfile = data => api.post('/profile', data).then(r => r.data)

// ---------- Accounts ----------
export const getAccounts = () => api.get('/accounts').then(r => r.data)
export const createAccount = data => api.post('/accounts', data).then(r => r.data)
export const updateAccount = (id, data) => api.put(`/accounts/${id}`, data).then(r => r.data)
export const deleteAccount = id => api.delete(`/accounts/${id}`)

// ---------- Income Sources ----------
export const getIncomeSources = () => api.get('/income-sources').then(r => r.data)
export const createIncomeSource = data => api.post('/income-sources', data).then(r => r.data)
export const updateIncomeSource = (id, data) => api.put(`/income-sources/${id}`, data).then(r => r.data)
export const deleteIncomeSource = id => api.delete(`/income-sources/${id}`)

// ---------- Expenses ----------
export const getExpenses = () => api.get('/expenses').then(r => r.data)
export const createExpense = data => api.post('/expenses', data).then(r => r.data)
export const updateExpense = (id, data) => api.put(`/expenses/${id}`, data).then(r => r.data)
export const deleteExpense = id => api.delete(`/expenses/${id}`)

// ---------- Social Security ----------
export const getSocialSecurity = () => api.get('/social-security').then(r => r.data)
export const saveSocialSecurity = data => api.post('/social-security', data).then(r => r.data)

// ---------- Scenarios ----------
export const getScenarios = () => api.get('/scenarios').then(r => r.data)
export const createScenario = data => api.post('/scenarios', data).then(r => r.data)
export const updateScenario = (id, data) => api.put(`/scenarios/${id}`, data).then(r => r.data)
export const deleteScenario = id => api.delete(`/scenarios/${id}`)
export const getScenarioOverrides = id => api.get(`/scenarios/${id}/overrides`).then(r => r.data)
export const addScenarioOverride = (id, data) => api.post(`/scenarios/${id}/overrides`, data).then(r => r.data)
export const createScenarioOverride = addScenarioOverride
export const deleteScenarioOverride = (scenarioId, overrideId) =>
  api.delete(`/scenarios/${scenarioId}/overrides/${overrideId}`)

// ---------- Rental Properties ----------
export const getRentalProperties = () => api.get('/rental-properties').then(r => r.data)
export const getRentalProperty = id => api.get(`/rental-properties/${id}`).then(r => r.data)
export const createRentalProperty = data => api.post('/rental-properties', data).then(r => r.data)
export const updateRentalProperty = (id, data) => api.put(`/rental-properties/${id}`, data).then(r => r.data)
export const deleteRentalProperty = id => api.delete(`/rental-properties/${id}`)

export const getMortgages = pid => api.get(`/rental-properties/${pid}/mortgages`).then(r => r.data)
export const createMortgage = (pid, data) => api.post(`/rental-properties/${pid}/mortgages`, data).then(r => r.data)
export const updateMortgage = (pid, id, data) => api.put(`/rental-properties/${pid}/mortgages/${id}`, data).then(r => r.data)
export const deleteMortgage = (pid, id) => api.delete(`/rental-properties/${pid}/mortgages/${id}`)

export const getRentalIncome = pid => api.get(`/rental-properties/${pid}/income`).then(r => r.data)
export const createRentalIncome = (pid, data) => api.post(`/rental-properties/${pid}/income`, data).then(r => r.data)
export const updateRentalIncome = (pid, id, data) => api.put(`/rental-properties/${pid}/income/${id}`, data).then(r => r.data)
export const deleteRentalIncome = (pid, id) => api.delete(`/rental-properties/${pid}/income/${id}`)

export const getRentalExpenses = pid => api.get(`/rental-properties/${pid}/expenses`).then(r => r.data)
export const createRentalExpense = (pid, data) => api.post(`/rental-properties/${pid}/expenses`, data).then(r => r.data)
export const updateRentalExpense = (pid, id, data) => api.put(`/rental-properties/${pid}/expenses/${id}`, data).then(r => r.data)
export const deleteRentalExpense = (pid, id) => api.delete(`/rental-properties/${pid}/expenses/${id}`)

// ---------- Simulation ----------
export const runSimulation = scenarioId => api.post(`/simulate/${scenarioId || 'base'}`).then(r => r.data)
export const runMonteCarlo = (scenarioId, params = {}) =>
  api.post(`/simulate/${scenarioId || 'base'}/monte-carlo`, params).then(r => r.data)
export const compareScenarios = scenarioIds =>
  api.post('/simulate/compare', { scenario_ids: scenarioIds }).then(r => r.data)
export const getSimulationResults = scenarioId =>
  api.get(`/simulate/${scenarioId}/results`).then(r => r.data)

// ---------- Optimization ----------
export const optimizeRothConversion = scenarioId =>
  api.post(`/optimize/roth-conversion/${scenarioId || 'base'}`).then(r => r.data)
export const optimizeSocialSecurity = scenarioId =>
  api.post(`/optimize/social-security/${scenarioId || 'base'}`).then(r => r.data)
