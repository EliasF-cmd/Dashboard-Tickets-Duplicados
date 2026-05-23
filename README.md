# Jira · Deduplicador de Clientes

Dashboard web para agrupar tickets duplicados do Jira Service Management.

## Deploy no Render (gratuito)

### 1. Suba o código no GitHub
- Crie um repositório no GitHub (pode ser privado)
- Faça upload desta pasta

### 2. Crie o serviço no Render
1. Acesse https://render.com e crie uma conta gratuita
2. Clique em **New → Web Service**
3. Conecte seu repositório GitHub
4. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
   - **Environment:** Node

### 3. Variáveis de ambiente (opcional)
Se quiser que o token fique salvo no servidor (sem precisar digitar toda vez):
- `JIRA_DOMAIN` → `wmi-solutions.atlassian.net`
- `JIRA_EMAIL`  → seu e-mail Atlassian
- `JIRA_TOKEN`  → seu API Token

### 4. Acesse a URL gerada pelo Render
Ex: `https://jira-dashboard-xxxx.onrender.com`

## Desenvolvimento local
```bash
npm install
npm run build
node server.js
# Acesse http://localhost:3000
```
