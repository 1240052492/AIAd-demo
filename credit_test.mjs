const BASE = 'http://localhost:4177'
const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123456' }),
})
const { data } = await login.json()
const H = { Authorization: 'Bearer ' + data.accessToken }

const g = await fetch(BASE + '/api/admin/credit-rules', { headers: H })
console.log('GET ->', g.status, await g.text())

const full = { registerBonus: 5, imageGeneration: 2, composition: 1, exportPng: 1, exportPdf: 2, exportSvg: 1 }
const p = await fetch(BASE + '/api/admin/credit-rules', {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify(full),
})
console.log('PUT full ->', p.status, await p.text())

const p2 = await fetch(BASE + '/api/admin/credit-rules', {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageGeneration: 9 }),
})
console.log('PUT partial ->', p2.status, await p2.text())
