'use client';
import { useState } from 'react';

const ESEMPI = [
  { label: 'Caduta + febbre', text: `Paziente 82 anni, stanotte caduta in bagno verso le 3. Riferisce di essere scivolata. Peso 72 kg stamattina, febbre 37.8°C, PA 145/90 mmHg, FC 92 bpm, satura 94% in aria ambiente. Piccola lesione da pressione sacrale stadio 1, arrossamento. Dolore 4/10.` },
  { label: 'Controllo standard', text: `Controllo giornaliero: peso 68.5 kg, temperatura 36.6, PA 130 su 80, FC 78, Sat 98%, glicemia a digiuno 110 mg/dL, diuresi regolare, alvo nella norma.` },
  { label: 'Lesione complessa', text: `Paziente allettato, piaga da decubito tallone dx con fibrina, peso 61 kg, febbricola 37.2, PA 118/70, FC 88, sat 96%. Non cadute oggi.` },
];

function mockExtract(text: string) {
  const lower = text.toLowerCase();
  const num = (re: RegExp) => { const m = text.match(re); return m ? parseFloat(m[1].replace(',', '.')) : null; };
  const has = (re: RegExp) => re.test(lower);
  const extractPA = () => {
    let m = text.match(/(?:PA|pressione)[^\d]{0,10}(\d+)\s*(?:\/|su)\s*(\d+)/i);
    if (m) return { s: parseInt(m[1]), d: parseInt(m[2]) };
    m = text.match(/(\d+)\s*\/\s*(\d+)\s*(?:mmhg)?/i);
    if (m) return { s: parseInt(m[1]), d: parseInt(m[2]) };
    return null;
  };
  const pa = extractPA();
  return {
    caduta: has(/cadut|scivolat|inciamp|a terra|caduto/),
    lesione: has(/lesione|piaga|decubito|ulcer|ferita|escoriaz/),
    peso: num(/(?:peso|pesa)\s*(\d+(?:[.,]\d+)?)\s*(?:kg|chili)/i) || num(/(\d+(?:[.,]\d+)?)\s*kg/i),
    temp: num(/(?:temp|febbr|°C)\D{0,10}(\d+(?:[.,]\d+)?)/i) || (has(/febbricola/) ? 37.4 : null),
    pa_s: pa?.s || null,
    pa_d: pa?.d || null,
    fc: num(/(?:FC|frequenza cardiaca|battiti)\D{0,10}(\d{2,3})/i) || num(/FC\s*(\d+)/i),
    sat: num(/(?:sat|satur|spo2)\D{0,10}(\d{2,3})\s*%/i),
    glicemia: num(/(?:glice|gluco)\D{0,10}(\d{2,3})/i),
    dolore: num(/dolore\D{0,10}(\d)\/10/i),
  };
}

export default function Page() {
  const [diary, setDiary] = useState(ESEMPI[0].text);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(true);

  const analyze = async () => {
    setLoading(true); setError(null); setResult(null);
    const t0 = Date.now();
    if (useMock) {
      await new Promise(r => setTimeout(r, 180 + Math.random()*200));
      const mock = mockExtract(diary);
      setResult({ latency: Date.now()-t0, mode: 'MOCK (simula Jev)', mock, raw: { message: 'Questo è il mock. Con chiave Vercel vera vedrai confidence calibrate reali.' } });
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ diary }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error + (json.details ? ': '+json.details : ''));
      setResult(json);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const mock = result?.mock;
  return (
    <div style={{maxWidth:1200, margin:'0 auto', padding:24}}>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
        <div>
          <h1 style={{fontSize:28, fontWeight:800, margin:0}}>Cartella Clinica • Estrazione con Jev</h1>
          <p style={{color:'#64748b', margin:'4px 0 0'}}>Scrivi/detta il diario → Jev estrae parametri tipizzati in &lt;400ms • Model: <code>typesafe-ai/jev</code> via Vercel AI Gateway</p>
        </div>
        <label style={{display:'flex', alignItems:'center', gap:8, background:'white', padding:'8px 12px', borderRadius:8, border:'1px solid #e2e8f0'}}>
          <input type="checkbox" checked={!useMock} onChange={e=>setUseMock(!e.target.checked)} /> Usa API reale Vercel
        </label>
      </header>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
        <div style={{background:'white', padding:16, borderRadius:12, border:'1px solid #e2e8f0'}}>
          <h3 style={{marginTop:0}}>Dettatura diario</h3>
          <textarea value={diary} onChange={e=>setDiary(e.target.value)} style={{width:'100%', height:220, padding:12, borderRadius:8, border:'1px solid #cbd5e1', fontSize:14}} />
          <div style={{display:'flex', gap:8, marginTop:10, flexWrap:'wrap'}}>
            {ESEMPI.map(ex=>(
              <button key={ex.label} onClick={()=>setDiary(ex.text)} style={{padding:'6px 10px', borderRadius:20, border:'1px solid #cbd5e1', background:'#f1f5f9', cursor:'pointer', fontSize:12}}>{ex.label}</button>
            ))}
          </div>
          <button onClick={analyze} disabled={loading} style={{marginTop:16, width:'100%', padding:'12px', borderRadius:10, background: loading ? '#94a3b8' : '#0f172a', color:'white', fontWeight:700, cursor:'pointer'}}>
            {loading ? 'Analizzo...' : `Analizza con Jev ${useMock ? '(mock)' : '(reale)'}`}
          </button>
          {!useMock && <p style={{fontSize:11, color:'#64748b', marginTop:8}}>Serve AI_GATEWAY_API_KEY=vck_... in .env.local o nelle env di Vercel</p>}
          {error && <div style={{marginTop:12, background:'#fef2f2', color:'#991b1b', padding:10, borderRadius:8, fontSize:13}}>{error}</div>}
        </div>

        <div style={{background:'white', padding:16, borderRadius:12, border:'1px solid #e2e8f0'}}>
          <h3 style={{marginTop:0}}>Risultato estrazione {result && <span style={{fontWeight:400, color:'#64748b'}}>• {result.latency}ms • {result.mode || result.model}</span>}</h3>
          {!result && <p style={{color:'#94a3b8'}}>Nessun risultato ancora. Incolla un diario e analizza.</p>}
          {result && (
            <>
              {mock ? (
                <div style={{display:'grid', gap:10}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    {[
                      ['Peso', mock.peso, 'kg'],
                      ['Temp', mock.temp, '°C'],
                      ['PA', mock.pa_s ? `${mock.pa_s}/${mock.pa_d}` : null, 'mmHg'],
                      ['FC', mock.fc, 'bpm'],
                      ['Sat', mock.sat, '%'],
                      ['Glicemia', mock.glicemia, 'mg/dL'],
                      ['Dolore', mock.dolore, '/10'],
                    ].map(([label, val, unit])=>(
                      <div key={label as string} style={{padding:10, borderRadius:8, background: val ? '#f0fdf4' : '#f8fafc', border:`1px solid ${val ? '#bbf7d0' : '#e2e8f0'}`}}>
                        <div style={{fontSize:11, color:'#64748b'}}>{label}</div>
                        <div style={{fontSize:16, fontWeight:700}}>{val ? `${val} ${unit}` : '— non rilevato'}</div>
                        {val && <div style={{fontSize:11}}>confidenza ~ {85+Math.floor(Math.random()*12)}% • snippet evidenziato</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex', gap:10, marginTop:8}}>
                    {mock.caduta && <div style={{flex:1, background:'#fef2f2', border:'1px solid #fecaca', padding:10, borderRadius:8}}>
                      <b>⚠️ Caduta rilevata</b><br/><a href="/scheda-cadute?source=jev&mock=1" style={{color:'#dc2626'}}>Proposta: Apri Scheda Cadute (link fittizio)</a>
                    </div>}
                    {mock.lesione && <div style={{flex:1, background:'#fff7ed', border:'1px solid #fed7aa', padding:10, borderRadius:8}}>
                      <b>🩹 Lesione rilevata</b><br/><a href="/scheda-lesioni?source=jev&mock=1" style={{color:'#ea580c'}}>Proposta: Apri Scheda Lesioni</a>
                    </div>}
                  </div>
                </div>
              ) : (
                <div>
                  <pre style={{background:'#0f172a', color:'#e2e8f0', padding:12, borderRadius:8, overflow:'auto', fontSize:12, maxHeight:400}}>{JSON.stringify(result.raw, null, 2)}</pre>
                  <p style={{fontSize:12, color:'#64748b'}}>Se vedi confidence, value, etc → è Jev vero da Vercel. Qui puoi mappare: se caduta_presente.value==true && confidence&gt;0.75 → apri scheda.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{marginTop:24, background:'#0f172a', color:'white', padding:16, borderRadius:12}}>
        <h4 style={{margin:'0 0 8px'}}>Dove mettere la chiave (importante)</h4>
        <code style={{fontSize:12, display:'block', whiteSpace:'preWrap'}}>{`1) In locale:
   crea file .env.local nella root del progetto
   AI_GATEWAY_API_KEY=vck_xxxxxxxxxxxx

2) Su Vercel quando fai deploy:
   Vercel Dashboard > tuo progetto > Settings > Environment Variables
   Aggiungi: AI_GATEWAY_API_KEY = vck_xxxxxxxxxxxx
   Redeploy

3) Test:
   npm run dev -> http://localhost:3000
   Togli spunta "mock" e analizza
`}</code>
      </div>
    </div>
  );
}
