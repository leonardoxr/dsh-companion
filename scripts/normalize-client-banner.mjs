import fs from 'node:fs'

const file = new URL('../client/client.js', import.meta.url)
let code = fs.readFileSync(file, 'utf8')
if (code.charCodeAt(0) === 0xFEFF) code = code.slice(1)
const expected = 'window.__ModuleLoader__.load({ id: "dsh-companion", factory: (require) => {'
const bodyMarker = '\t\tvar module = { exports: {} };'
if (!code.startsWith(expected)) {
  const body = code.indexOf(bodyMarker)
  if (body < 0 || !code.startsWith('window.__ModuleLoader__.load({')) {
    throw new Error('client bundle is missing the DSH lazy-module loader wrapper')
  }
  code = `${expected}\n${code.slice(body)}`
}
fs.writeFileSync(file, code)
console.log('normalized client/client.js loader banner')
