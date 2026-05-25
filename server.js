import express from 'express'
import fetch from 'node-fetch'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

const JIRA_DOMAIN = process.env.JIRA_DOMAIN || 'wmi-solutions.atlassian.net'
const JIRA_EMAIL  = process.env.JIRA_EMAIL  || ''
const JIRA_TOKEN  = process.env.JIRA_TOKEN  || ''

// IMPORTANTE: parsear body JSON antes do proxy
app.use(express.json())

app.use('/api/jira', async (req, res) => {
  const authHeader = req.headers['x-jira-auth']
  const auth = authHeader || (JIRA_EMAIL && JIRA_TOKEN
    ? 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')
    : null)

  if (!auth) return res.status(401).json({ error: 'Credenciais não configuradas.' })

  const jiraUrl = `https://${JIRA_DOMAIN}${req.url}`
  console.log(`Proxying: ${req.method} ${jiraUrl}`)

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }

    // Repassa o body para requisições POST/PUT
    if (req.method === 'POST' || req.method === 'PUT') {
      fetchOptions.body = JSON.stringify(req.body)
    }

    const jiraRes = await fetch(jiraUrl, fetchOptions)
    const contentType = jiraRes.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const data = await jiraRes.json()
      res.status(jiraRes.status).json(data)
    } else {
      const text = await jiraRes.text()
      console.error('Resposta não-JSON:', text.slice(0, 300))
      res.status(jiraRes.status).json({ error: `Erro do Jira (${jiraRes.status})`, detail: text.slice(0, 200) })
    }
  } catch (err) {
    console.error('Proxy error:', err)
    res.status(502).json({ error: 'Erro ao conectar com o Jira: ' + err.message })
  }
})

app.use(express.static(path.join(__dirname, 'dist')))
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`))
