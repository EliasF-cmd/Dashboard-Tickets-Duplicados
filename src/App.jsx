import { useState, useMemo } from "react";

const normalizeCNPJ  = (v = "") => v.replace(/\D/g, "").trim();
const normalizePhone = (v = "") => v.replace(/\D/g, "").replace(/^0+/, "").slice(-9);
const normalizeName  = (v = "") =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const splitPhones = (v = "") =>
  v.split(/\s*(?:ou|e|\/|,)\s*/i).map(normalizePhone).filter(p => p.length >= 8);

const similarity = (a = "", b = "") => {
  a = normalizeName(a); b = normalizeName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.includes(shorter) && shorter.length >= 4) return 0.85;
  const at = new Set(a.split(/\s+/));
  const bt = new Set(b.split(/\s+/));
  const inter = [...at].filter(t => bt.has(t) && t.length > 2).length;
  const union = new Set([...at, ...bt]).size;
  return inter / union;
};

const sameClient = (a, b) => {
  const ca = normalizeCNPJ(a.cnpj), cb = normalizeCNPJ(b.cnpj);
  if (ca && cb && ca.length >= 11 && ca === cb) return { match: true, reason: "CNPJ idêntico" };
  if (splitPhones(a.phone).some(x => splitPhones(b.phone).includes(x))) return { match: true, reason: "Telefone idêntico" };
  const sim = similarity(a.name, b.name);
  if (sim >= 0.75) return { match: true, reason: `Nome similar (${Math.round(sim * 100)}%)` };
  return { match: false };
};

const groupTickets = (tickets) => {
  const groups = [], assigned = new Set();
  for (let i = 0; i < tickets.length; i++) {
    if (assigned.has(i)) continue;
    const group = { tickets: [tickets[i]], reasons: [] };
    assigned.add(i);
    for (let j = i + 1; j < tickets.length; j++) {
      if (assigned.has(j)) continue;
      const r = sameClient(tickets[i], tickets[j]);
      if (r.match) {
        group.tickets.push(tickets[j]);
        if (!group.reasons.includes(r.reason)) group.reasons.push(r.reason);
        assigned.add(j);
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.tickets.length - a.tickets.length);
};

const SC = { "em andamento":"#60a5fa", aguardando:"#f59e0b", aberto:"#f59e0b", resolvido:"#22c55e", fechado:"#22c55e" };
const sColor = (s="") => { const k = Object.keys(SC).find(k=>s.toLowerCase().includes(k)); return SC[k]||"#475569"; };

const inputStyle = { background:"#0a1628", border:"1px solid #1e3a5f", borderRadius:8, padding:"8px 12px", color:"#e2e8f0", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box" };
const Badge     = ({children,color}) => <span style={{background:color,color:"#fff",borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700}}>{children}</span>;
const ReasonTag = ({label}) => <span style={{background:"#1e3a5f",color:"#93c5fd",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>{label}</span>;
const Info      = ({label,value}) => !value?null:<span style={{fontSize:11}}><span style={{color:"#64748b",marginRight:4}}>{label}:</span><span style={{color:"#cbd5e1"}}>{value}</span></span>;
const Field     = ({label,value,onChange,placeholder,type="text"}) => (
  <div><label style={{fontSize:12,color:"#64748b",display:"block",marginBottom:4}}>{label}</label>
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={inputStyle}/></div>
);

const TicketCard = ({ticket}) => (
  <div style={{background:"#0f1929",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 14px"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
      <a href={`https://wmi-solutions.atlassian.net/browse/${ticket.id}`} target="_blank" rel="noreferrer"
        style={{color:"#60a5fa",fontSize:11,fontWeight:700,fontFamily:"monospace",textDecoration:"none"}}>{ticket.id} ↗</a>
      <Badge color={sColor(ticket.status)}>{ticket.status}</Badge>
      {ticket.created && <span style={{color:"#475569",fontSize:11}}>{ticket.created}</span>}
    </div>
    <div style={{color:"#e2e8f0",fontSize:13,fontWeight:500,marginBottom:6}}>{ticket.title}</div>
    <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
      <Info label="Nome" value={ticket.name}/>
      <Info label="CNPJ" value={ticket.cnpj}/>
      <Info label="Telefone" value={ticket.phone}/>
      <Info label="Anydesk" value={ticket.anydesk}/>
    </div>
  </div>
);

async function fetchJiraTickets({ email, token, project, maxResults }) {
  const auth = "Basic " + btoa(`${email}:${token}`);
  const headers = { "x-jira-auth": auth, "Content-Type": "application/json" };

  const fieldsRes = await fetch("/api/jira/rest/api/3/field", { headers });
  if (!fieldsRes.ok) throw new Error(`Erro ao buscar campos (${fieldsRes.status})`);
  const fields = await fieldsRes.json();

  const find = (...names) => {
    const lower = names.map(n => n.toLowerCase());
    return fields.find(f => lower.some(n => f.name.toLowerCase().includes(n)))?.id || null;
  };
  const fNome = find("nome solicitante", "nome do solicitante");
  const fTel  = find("telefone contato", "telefone", "phone");
  const fCnpj = find("cnpj");
  const fAny  = find("anydesk");

  const fieldIds = ["summary","status","created", fNome, fTel, fCnpj, fAny].filter(Boolean);

  let allIssues = [], startAt = 0, total = Infinity;
  while (allIssues.length < maxResults && allIssues.length < total) {
    // POST em vez de GET — endpoint GET foi descontinuado (erro 410)
    const res = await fetch(`/api/jira/rest/api/3/search/jql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jql: `project = ${project} ORDER BY created DESC`,
        startAt,
        maxResults: 100,
        fields: fieldIds,
      }),
    });
    if (!res.ok) throw new Error(`Erro na busca (${res.status})`);
    const data = await res.json();
    total = data.total;
    allIssues.push(...data.issues);
    startAt += data.issues.length;
    if (!data.issues.length) break;
  }

  const str = v => !v ? "" : typeof v === "string" ? v : v.value || v.name || String(v);
  return {
    tickets: allIssues.map(i => ({
      id: i.key, title: i.fields.summary || "",
      status: i.fields.status?.name || "—",
      created: (i.fields.created || "").slice(0, 10),
      name:    fNome ? str(i.fields[fNome]) : "",
      phone:   fTel  ? str(i.fields[fTel])  : "",
      cnpj:    fCnpj ? str(i.fields[fCnpj]) : "",
      anydesk: fAny  ? str(i.fields[fAny])  : "",
    })),
    fieldMap: { fNome, fTel, fCnpj, fAny },
    total,
  };
}

export default function App() {
  const [tab,      setTab]      = useState("connect");
  const [email,    setEmail]    = useState("");
  const [token,    setToken]    = useState("");
  const [project,  setProject]  = useState("SUP");
  const [maxRes,   setMaxRes]   = useState("500");
  const [tickets,  setTickets]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [fieldMap, setFieldMap] = useState(null);
  const [total,    setTotal]    = useState(null);
  const [filter,   setFilter]   = useState("");
  const [expanded, setExpanded] = useState({});

  const groups      = useMemo(() => groupTickets(tickets), [tickets]);
  const dupeGroups  = groups.filter(g => g.tickets.length > 1);
  const soloGroups  = groups.filter(g => g.tickets.length === 1);
  const filtered    = dupeGroups.filter(g => !filter || g.tickets.some(t =>
    normalizeName(t.name).includes(normalizeName(filter)) ||
    t.cnpj.includes(filter) || t.id.toLowerCase().includes(filter.toLowerCase()) || t.phone.includes(filter)
  ));

  const handleFetch = async () => {
    setLoading(true); setError(null); setTickets([]); setFieldMap(null);
    try {
      const r = await fetchJiraTickets({ email, token, project, maxResults: parseInt(maxRes)||500 });
      setTickets(r.tickets); setFieldMap(r.fieldMap); setTotal(r.total); setTab("dashboard");
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };
  const toggle = idx => setExpanded(e => ({...e,[idx]:!e[idx]}));

  return (
    <div style={{minHeight:"100vh",background:"#060d1a",color:"#e2e8f0",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{background:"#0a1628",borderBottom:"1px solid #1e3a5f",padding:"0 24px"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",gap:16,height:56,flexWrap:"wrap"}}>
          <span style={{fontSize:18,fontWeight:800,color:"#60a5fa"}}>🎫 Jira · Deduplicador de Clientes</span>
          {tickets.length>0 && <span style={{fontSize:12,color:"#475569"}}>{tickets.length} tickets{total>tickets.length?` de ${total}`:""}</span>}
          <div style={{marginLeft:"auto",display:"flex",gap:4}}>
            {[{id:"connect",label:"🔌 Conectar"},{id:"dashboard",label:"📊 Dashboard",disabled:!tickets.length}].map(t=>(
              <button key={t.id} onClick={()=>!t.disabled&&setTab(t.id)} disabled={t.disabled}
                style={{background:tab===t.id?"#1e3a5f":"transparent",color:tab===t.id?"#93c5fd":t.disabled?"#2d3748":"#64748b",
                  border:"none",borderRadius:6,padding:"6px 16px",cursor:t.disabled?"not-allowed":"pointer",fontWeight:600,fontSize:13}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"28px 16px",width:"100%"}}>
        {tab==="connect" && (
          <div style={{maxWidth:500}}>
            <h2 style={{color:"#93c5fd",fontWeight:800,margin:"0 0 4px"}}>Conectar ao Jira</h2>
            <p style={{color:"#64748b",fontSize:13,marginBottom:24}}>
              Gere seu API Token em{" "}
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>
                id.atlassian.com → Security → API Tokens
              </a>
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Field label="Seu e-mail Atlassian" value={email} onChange={setEmail} placeholder="voce@empresa.com" type="email"/>
              <Field label="API Token" value={token} onChange={setToken} placeholder="Cole o token aqui" type="password"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Field label="Chave do Projeto" value={project} onChange={setProject} placeholder="SUP"/>
                <Field label="Máx. tickets" value={maxRes} onChange={setMaxRes} placeholder="500"/>
              </div>
            </div>
            {error && (
              <div style={{background:"#450a0a",border:"1px solid #f87171",borderRadius:8,padding:"10px 14px",color:"#fca5a5",fontSize:13,marginTop:16}}>
                ⚠️ {error}
              </div>
            )}
            <div style={{marginTop:14,background:"#0a1f3a",border:"1px solid #1e3a5f",borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:4}}>🔒 Segurança</div>
              <div style={{fontSize:12,color:"#475569",lineHeight:1.6}}>
                Suas credenciais trafegam apenas entre o seu navegador e o servidor Render (HTTPS). O servidor faz a chamada ao Jira. Nenhum dado é armazenado.
              </div>
            </div>
            <button onClick={handleFetch} disabled={loading||!email||!token}
              style={{marginTop:16,background:loading?"#1e3a5f":"#1d4ed8",color:"#fff",border:"none",borderRadius:8,
                padding:"12px 28px",fontWeight:700,fontSize:14,cursor:loading||!email||!token?"not-allowed":"pointer",width:"100%"}}>
              {loading?"⏳ Buscando tickets...":"🚀 Buscar e Analisar"}
            </button>
            {fieldMap && (
              <div style={{marginTop:16,background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:8}}>Campos detectados automaticamente:</div>
                {[["Nome Solicitante",fieldMap.fNome],["Telefone Contato",fieldMap.fTel],["CNPJ",fieldMap.fCnpj],["Anydesk",fieldMap.fAny]].map(([k,v])=>(
                  <div key={k} style={{fontSize:12,display:"flex",gap:8,marginBottom:4}}>
                    <span style={{color:v?"#34d399":"#f87171"}}>{v?"✓":"✗"}</span>
                    <span style={{color:"#94a3b8"}}>{k}</span>
                    <span style={{color:"#475569",fontFamily:"monospace"}}>{v||"não encontrado"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab==="dashboard" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:24}}>
              {[
                {label:"Tickets Carregados",value:tickets.length,color:"#60a5fa"},
                {label:"Grupos Duplicados", value:dupeGroups.length,color:"#f59e0b"},
                {label:"Tickets em Dupl.",  value:dupeGroups.reduce((s,g)=>s+g.tickets.length,0),color:"#f87171"},
                {label:"Clientes Únicos",   value:soloGroups.length,color:"#34d399"},
              ].map(s=>(
                <div key={s.label} style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:10,padding:"14px 18px"}}>
                  <div style={{fontSize:28,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:12,color:"#64748b",fontWeight:600,marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center"}}>
              <input placeholder="Filtrar por nome, CNPJ, telefone ou ticket…" value={filter} onChange={e=>setFilter(e.target.value)}
                style={{...inputStyle,flex:1,padding:"8px 14px"}}/>
              <button onClick={()=>{setTab("connect");setTickets([]);}}
                style={{background:"#1e3a5f",color:"#93c5fd",border:"none",borderRadius:8,padding:"8px 16px",fontWeight:600,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>
                🔄 Atualizar
              </button>
            </div>
            {filtered.length===0 && <div style={{color:"#64748b",textAlign:"center",padding:40}}>Nenhum grupo duplicado encontrado.</div>}
            {filtered.map((group,idx)=>{
              const lead=group.tickets[0], open=expanded[idx];
              return (
                <div key={idx} style={{background:"#0a1628",border:"1px solid #f59e0b55",borderRadius:12,marginBottom:10,overflow:"hidden"}}>
                  <div onClick={()=>toggle(idx)} style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <span style={{background:"#f59e0b22",color:"#f59e0b",borderRadius:6,padding:"4px 12px",fontWeight:800,fontSize:20,minWidth:36,textAlign:"center"}}>
                      {group.tickets.length}
                    </span>
                    <div style={{flex:1,minWidth:160}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{lead.name||"Cliente sem nome"}</div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                        {lead.cnpj&&<span style={{marginRight:12}}>CNPJ: {lead.cnpj}</span>}
                        {lead.phone&&<span>Tel: {lead.phone}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {group.reasons.map(r=><ReasonTag key={r} label={r}/>)}
                    </div>
                    <span style={{color:"#475569",fontSize:16}}>{open?"▲":"▼"}</span>
                  </div>
                  {open&&(
                    <div style={{borderTop:"1px solid #1e3a5f",padding:"12px 18px",display:"flex",flexDirection:"column",gap:8}}>
                      {group.tickets.map(t=><TicketCard key={t.id} ticket={t}/>)}
                    </div>
                  )}
                </div>
              );
            })}
            {soloGroups.length>0&&(
              <details style={{marginTop:8}}>
                <summary style={{cursor:"pointer",color:"#64748b",fontSize:13,padding:"8px 0"}}>
                  Ver {soloGroups.length} clientes sem duplicidade
                </summary>
                <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:8}}>
                  {soloGroups.map(g=><TicketCard key={g.tickets[0].id} ticket={g.tickets[0]}/>)}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
