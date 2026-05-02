import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useSpring, useTransform, animate } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { getProfile, getAccounts, getIncomeSources, getExpenses, getSocialSecurity } from '../api'

const CLAIMING_AGE_STORAGE_KEY = 'retirement-planner.social-security.claiming-age'
const MILLIONS_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

function formatMillionsFromThousands(valueK) {
  return `$${MILLIONS_FORMATTER.format((valueK || 0) / 1000)}M`
}

/* ── Projection engine (client-side) ──────────────────────── */
function project({ savingsRate, inflation, marketReturn, targetAge }, startAge, portfolioK, annualIncome, annualExpenses) {
  const data = []
  let p = portfolioK * 1000
  const contributions = annualIncome * (savingsRate / 100)
  for (let age = startAge; age <= 95; age++) {
    const retired = age >= targetAge
    if (!retired) {
      p = p * (1 + marketReturn / 100) + contributions
    } else {
      const exp = annualExpenses * Math.pow(1 + inflation / 100, age - targetAge)
      p = Math.max(0, p * (1 + marketReturn / 100) - exp)
    }
    data.push({ age, value: Math.round(p / 1000), retired })
  }
  return data
}

/* ── Slider Tick Labels ───────────────────────────────────── */
function SliderTicks({ min, max, steps = 4 }) {
  const labels = []
  for (let i = 0; i <= steps; i++) {
    const v = min + (i / steps) * (max - min)
    labels.push(
      <span key={i} style={{ fontSize:10, color:'#9CA3AF', fontVariantNumeric:'tabular-nums' }}>
        {Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}
      </span>
    )
  }
  return (
    <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
      {labels}
    </div>
  )
}

/* ── Animated Digital Counter ────────────────────────────── */
function AnimatedNumber({ value, decimals = 0 }) {
  const ref = useRef(null)
  const prev = useRef(value)
  useEffect(() => {
    const ctrl = animate(prev.current, value, {
      duration: 0.4, ease: 'easeOut',
      onUpdate: v => { if (ref.current) ref.current.textContent = v.toFixed(decimals) },
    })
    prev.current = value
    return ctrl.stop
  }, [value, decimals])
  return <span ref={ref}>{value.toFixed(decimals)}</span>
}

/* ── Scrubbable Readout ───────────────────────────────────── */
function Readout({ value, unit, min, max, step, onChange }) {
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startV   = useRef(0)
  const decimals = step < 1 ? 1 : 0
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) setInputValue(value)
  }, [value, editing])

  const onDown = useCallback(e => {
    if (editing) return;
    dragging.current = true; startX.current = e.clientX; startV.current = value
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [value, editing])
  const onMove = useCallback(e => {
    if (!dragging.current || editing) return
    const dx = (e.clientX - startX.current) * (max - min) / 220
    const v  = Math.max(min, Math.min(max, startV.current + dx))
    onChange(Math.round(v / step) * step)
  }, [min, max, step, onChange, editing])
  const onUp = useCallback(() => { dragging.current = false }, [])

  const handleDisplayClick = () => {
    setEditing(true)
    setTimeout(() => { inputRef.current?.focus() }, 0)
  }

  const handleInputChange = e => {
    setInputValue(e.target.value)
  }

  const commitInput = () => {
    let v = parseFloat(inputValue)
    if (isNaN(v)) v = value
    v = Math.max(min, Math.min(max, Math.round(v / step) * step))
    setEditing(false)
    if (v !== value) onChange(v)
  }

  const handleInputBlur = () => {
    commitInput()
  }

  const handleInputKeyDown = e => {
    if (e.key === 'Enter') {
      commitInput()
    } else if (e.key === 'Escape') {
      setEditing(false)
      setInputValue(value)
    }
  }

  return (
    <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={inputValue}
          min={min}
          max={max}
          step={step}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          style={{
            fontFamily:"'SF Mono','Menlo',monospace",
            background:'#F8F9FB', border:'1px solid #2563EB',
            borderRadius:8, padding:'6px 14px', fontSize:26, fontWeight:600,
            letterSpacing:'-.02em', color:'#111827',
            boxShadow:'inset 0 1px 2px rgba(0,0,0,0.05)',
            minWidth:80, textAlign:'right', outline:'none',
            transition:'border-color .15s',
          }}
        />
      ) : (
        <motion.div
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          whileTap={{ scale:.97 }}
          style={{
            fontFamily:"'SF Mono','Menlo',monospace",
            background:'#F8F9FB', border:'1px solid #E2E8F0',
            borderRadius:8, padding:'6px 14px', fontSize:26, fontWeight:600,
            letterSpacing:'-.02em', color:'#111827',
            boxShadow:'inset 0 1px 2px rgba(0,0,0,0.05)',
            cursor:'ew-resize', userSelect:'none', minWidth:80, textAlign:'right',
            transition:'border-color .15s',
          }}
          whileHover={{ borderColor:'#2563EB' }}
          tabIndex={0}
          onClick={handleDisplayClick}
          onKeyDown={e => { if (e.key === 'Enter') handleDisplayClick() }}
          role="button"
          aria-label="Edit value"
        >
          <AnimatedNumber value={value} decimals={decimals} />
        </motion.div>
      )}
      <span style={{ fontSize:13, color:'#6B7280', fontFamily:"'SF Mono',Menlo,monospace" }}>{unit}</span>
    </div>
  )
}

/* ── Precision Fader ─────────────────────────────────────── */
function PrecisionFader({ label, value, min, max, step = .1, unit = '', onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  const cls = 'pf-' + label.toLowerCase().replace(/[^a-z0-9]/g, '-')
  return (
    <div style={{ padding:'16px 20px', borderBottom:'1px solid #E2E8F0' }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:12 }}>
        {label}
      </div>
      <div style={{ marginBottom:14 }}>
        <Readout value={value} unit={unit} min={min} max={max} step={step} onChange={onChange} />
      </div>
      <style>{`
        input.${cls} {
          -webkit-appearance:none; appearance:none;
          width:100%; height:20px; background:transparent;
          display:block; cursor:pointer; padding:0; margin:0;
          outline:none; box-shadow:none; border:none;
        }
        input.${cls}::-webkit-slider-runnable-track {
          height:6px; border-radius:3px;
          background:linear-gradient(to right,
            #2563EB 0%, #2563EB ${pct}%,
            #E2E8F0 ${pct}%, #E2E8F0 100%);
        }
        input.${cls}::-webkit-slider-thumb {
          -webkit-appearance:none;
          width:20px; height:20px; margin-top:-7px;
          background:#FFFFFF;
          border:2.5px solid #2563EB;
          border-radius:50%;
          box-shadow:0 1px 4px rgba(37,99,235,0.25), 0 1px 3px rgba(0,0,0,0.10);
          cursor:pointer;
          transition:box-shadow .15s;
        }
        input.${cls}::-webkit-slider-thumb:hover {
          box-shadow:0 0 0 5px rgba(37,99,235,0.12), 0 1px 4px rgba(37,99,235,0.25);
        }
        input.${cls}::-moz-range-track {
          height:6px; border-radius:3px; background:#E2E8F0;
        }
        input.${cls}::-moz-range-progress {
          height:6px; border-radius:3px; background:#2563EB;
        }
        input.${cls}::-moz-range-thumb {
          width:20px; height:20px; border:2.5px solid #2563EB;
          border-radius:50%; background:#FFFFFF;
          box-shadow:0 1px 4px rgba(37,99,235,0.25);
          cursor:pointer;
        }
      `}</style>
      <input type="range" className={cls} min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)} />
      <SliderTicks min={min} max={max} />
    </div>
  )
}

/* ── Tooltip ─────────────────────────────────────────────── */
function PrecisionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background:'#FFFFFF', border:'1px solid #E2E8F0', padding:'10px 14px',
      borderRadius:10, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      boxShadow:'0 4px 16px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
        Age {d?.age}{d?.retired ? ' · Retired' : ''}
      </div>
      <div style={{ fontSize:18, color:'#2563EB', fontWeight:700, fontFamily:"'SF Mono',Menlo,monospace", letterSpacing:'-.02em' }}>
        {formatMillionsFromThousands(d?.value || 0)}
      </div>
    </div>
  )
}

/* ── Status Row ──────────────────────────────────────────── */
function StatusRow({ label, value, accent, positive, negative }) {
  const color = accent ? '#2563EB' : positive ? '#16A34A' : negative ? '#DC2626' : '#111827'
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F1F5F9' }}>
      <span style={{ fontSize:13, fontWeight:500, color:'#6B7280' }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:700, color, fontFamily:"'SF Mono',Menlo,monospace", letterSpacing:'-.01em' }}>{value}</span>
    </div>
  )
}

/* ── Dashboard ───────────────────────────────────────────── */
export default function Dashboard() {
  const [params, setParams] = useState({ savingsRate:20, inflation:3.0, marketReturn:7.0, targetAge:65 })
  const [startAge,       setStartAge]       = useState(40)
  const [portfolioK,     setPortfolioK]     = useState(500)
  const [annualIncome,   setAnnualIncome]   = useState(150000)
  const [annualExpenses, setAnnualExpenses] = useState(80000)
  const [socialSecurityClaimingAge, setSocialSecurityClaimingAge] = useState(null)
  const [loaded,         setLoaded]         = useState(false)

  useEffect(() => {
    const storedClaimingAge = window.localStorage.getItem(CLAIMING_AGE_STORAGE_KEY)
    Promise.all([
      getProfile().catch(() => null),
      getAccounts().catch(() => []),
      getIncomeSources().catch(() => []),
      getExpenses().catch(() => []),
      getSocialSecurity().catch(() => null),
    ]).then(([prof, accs, inc, exp, socialSecurity]) => {
      if (prof?.birth_date) {
        const age = new Date().getFullYear() - new Date(prof.birth_date).getFullYear()
        setStartAge(age)
        if (prof.retirement_age) setParams(p => ({ ...p, targetAge: prof.retirement_age }))
        if (prof.inflation_rate) setParams(p => ({ ...p, inflation: prof.inflation_rate }))
      }
      if (accs?.length) setPortfolioK(Math.round(accs.reduce((s, a) => s + (a.balance || 0), 0) / 1000))
      if (inc?.length)  setAnnualIncome(inc.reduce((s, i) => s + (i.annual_amount || 0), 0) || 150000)
      if (exp?.length)  setAnnualExpenses(exp.reduce((s, e) => s + (e.annual_amount || 0), 0) || 80000)
      const fallbackClaimingAge = storedClaimingAge ? Number(storedClaimingAge) : null
      setSocialSecurityClaimingAge(socialSecurity?.claiming_age ?? fallbackClaimingAge)
      setLoaded(true)
    })
  }, [])

  const set = k => v => setParams(p => ({ ...p, [k]: v }))

  const data        = project(params, startAge, portfolioK, annualIncome, annualExpenses)
  const retData     = data.find(d => d.age >= params.targetAge)
  const finalData   = data[data.length - 1]
  const peakValue   = Math.max(...data.map(d => d.value))
  const solvent     = (finalData?.value ?? 0) > 0
  const domainMax   = Math.ceil(peakValue * 1.08 / 500) * 500

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'var(--font)' }}>

      {/* ── CONTROL BLOCK ──────────────────────────────────── */}
      <div style={{
        width:290, minWidth:290, display:'flex', flexDirection:'column',
        background:'#FFFFFF',
        borderRight:'1px solid #E2E8F0',
        overflowY:'auto',
      }}>
        {/* Header */}
        <div style={{
          padding:'20px 20px 16px', borderBottom:'1px solid #E2E8F0',
          background:'#FAFBFC',
        }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:4 }}>
            Parameters
          </div>
          <div style={{ fontSize:17, fontWeight:700, color:'#111827', letterSpacing:'-.02em' }}>
            Retirement Vector
          </div>
        </div>

        {/* Faders */}
        <PrecisionFader label="Savings Rate"    value={params.savingsRate}  min={0}  max={50} step={.5}  unit="%"  onChange={set('savingsRate')}  />
        <PrecisionFader label="Annual Inflation" value={params.inflation}   min={0}  max={10} step={.1}  unit="%"  onChange={set('inflation')}    />
        <PrecisionFader label="Market Return"    value={params.marketReturn} min={0}  max={20} step={.1}  unit="%"  onChange={set('marketReturn')}  />
        <PrecisionFader label="Retire Age"       value={params.targetAge}   min={40} max={80} step={1}   unit="yr" onChange={set('targetAge')}    />

        {/* Status readout */}
        <div style={{ padding:'16px 20px', marginTop:'auto', borderTop:'1px solid #E2E8F0', background:'#FAFBFC' }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:12 }}>
            Projection
          </div>
          <StatusRow label="At Retirement" value={formatMillionsFromThousands(retData?.value ?? 0)} accent />
          <StatusRow label="Peak Value"    value={formatMillionsFromThousands(peakValue)} />
          <StatusRow label="Age 95"        value={formatMillionsFromThousands(Math.max(0, finalData?.value ?? 0))} positive={solvent} negative={!solvent} />
          <div style={{ marginTop:12, paddingTop:4 }}>
            <span style={{
              display:'inline-block', padding:'4px 12px', borderRadius:100,
              fontSize:12, fontWeight:600,
              background: solvent ? '#F0FDF4' : '#FEF2F2',
              color: solvent ? '#16A34A' : '#DC2626',
              border: `1px solid ${solvent ? '#BBF7D0' : '#FECACA'}`,
            }}>
              {solvent ? 'Solvent to 95' : 'Funds Depleted'}
            </span>
          </div>
          <div style={{ marginTop:10, fontSize:12, color:'#9CA3AF', lineHeight:1.5 }}>
            Base: {formatMillionsFromThousands(portfolioK)} at age {startAge}
          </div>
        </div>
      </div>

      {/* ── VECTOR PLOT ──────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#F0F2F5', minWidth:0 }}>
        {/* Plot header */}
        <div style={{
          padding:'16px 28px', borderBottom:'1px solid #E2E8F0', background:'#FFFFFF',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:'#111827', letterSpacing:'-.02em' }}>Portfolio Projection</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>Age {startAge}–95</div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { label:'Return',    val:`${params.marketReturn}%`, hi:true },
              { label:'Inflation', val:`${params.inflation}%`           },
              { label:'Savings',   val:`${params.savingsRate}%`          },
            ].map(m => (
              <div key={m.label} style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{m.label}</div>
                <div style={{ fontSize:16, fontWeight:700, color: m.hi ? '#2563EB' : '#111827', fontFamily:"'SF Mono',Menlo,monospace", letterSpacing:'-.02em' }}>{m.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex:1, padding:'20px', minHeight:0 }}>
          <div style={{ background:'#FFFFFF', borderRadius:12, border:'1px solid #E2E8F0', height:'100%', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', overflow:'hidden', padding:'12px 8px 8px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top:16, right:24, bottom:36, left:16 }}>
              <defs>
                <filter id="lightLeak" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="bigBlur" />
                  <feComponentTransfer in="bigBlur" result="softAura">
                    <feFuncA type="linear" slope="0.15" />
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode in="softAura" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid strokeDasharray="2 6" stroke="#F1F5F9" horizontal={true} vertical={false} />
              <XAxis dataKey="age"
                stroke="transparent"
                tick={{ fill:'#9CA3AF', fontSize:11, fontFamily:"'SF Mono',Menlo,monospace" }}
                tickLine={false} axisLine={{ stroke:'#E2E8F0' }}
                label={{ value:'Age', position:'insideBottom', offset:-18, fill:'#9CA3AF', fontSize:11 }}
              />
              <YAxis
                stroke="transparent"
                tick={{ fill:'#9CA3AF', fontSize:11, fontFamily:"'SF Mono',Menlo,monospace" }}
                tickLine={false} axisLine={false}
                domain={[0, domainMax]}
                tickFormatter={v => formatMillionsFromThousands(v)}
              />
              <Tooltip content={<PrecisionTooltip />}
                cursor={{ stroke:'#CBD5E1', strokeWidth:1 }}
              />
              <ReferenceLine x={params.targetAge}
                stroke="#CBD5E1" strokeDasharray="4 4"
                label={{ value:'Retire', position:'insideTopRight', fill:'#9CA3AF', fontSize:11 }}
              />
              {socialSecurityClaimingAge && (
                <ReferenceLine x={socialSecurityClaimingAge}
                  stroke="#CBD5E1" strokeDasharray="4 4"
                  label={{ value:'Soc Sec', position:'insideTopLeft', fill:'#9CA3AF', fontSize:11 }}
                />
              )}
              <Line
                type="monotone" dataKey="value"
                stroke="#2563EB" strokeWidth={2.5}
                dot={false}
                activeDot={{ r:4, fill:'#2563EB', stroke:'#FFFFFF', strokeWidth:2 }}
                filter="url(#lightLeak)"
                isAnimationActive={true}
                animationDuration={450} animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom ticker */}
        <div style={{
          padding:'10px 28px', borderTop:'1px solid #E2E8F0', background:'#FFFFFF',
          display:'flex', gap:24, fontSize:12, color:'#9CA3AF',
          alignItems:'center',
        }}>
          {[['Return',`${params.marketReturn}%`],['Inflation',`${params.inflation}%`],['Savings',`${params.savingsRate}%`],['Target',`Age ${params.targetAge}`]].map(([k,v]) => (
            <span key={k}>{k}&nbsp;<span style={{ color:'#374151', fontFamily:"'SF Mono',Menlo,monospace", fontWeight:600 }}>{v}</span></span>
          ))}
          <span style={{ marginLeft:'auto', fontSize:11 }}>Drag readouts or sliders to adjust</span>
        </div>
      </div>
    </div>
  )
}
