import express from 'express'
import fetch from 'node-fetch'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Credenciais via variáveis de ambiente (configuradas no Render)
const JIRA_DOMAIN = process.env.JIRA_DOMAIN || 'wmi-solutions.atlassian.net'
const JIRA_EMAIL  = process.env.JIRA_EMAIL  || ''
const JIRA_TOKEN  = process.env.JIRA_TOKEN  || ''

// ── Proxy para a API do Jira ──────────────────────────────────────────────
app.use('/api/jira', async (req, res) => {
  // Suporte a autenticação por usuário (passada no header) OU variável de ambiente
  const authHeader = req.headers['x-jira-auth']
  const auth = authHeader || (JIRA_EMAIL && JIRA_TOKEN
    ? 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')
    : null)

  if (!auth) {
    return res.status(401).json({ error: 'Credenciais não configuradas.' })
  }

  const jiraPath = req.url  // ex: /rest/api/3/field
  const jiraUrl  = `https://${JIRA_DOMAIN}${jiraPath}`

  try {
    const jiraRes = await fetch(jiraUrl, {
      method: req.method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })
    const data = await jiraRes.json()
    res.status(jiraRes.status).json(data)
  } catch (err) {
    console.error('Jira proxy error:', err)
    res.status(502).json({ error: 'Erro ao conectar com o Jira.' })
  }
})

// ── Servir o front-end buildado ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`))
