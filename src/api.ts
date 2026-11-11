const BASE = '/api'

async function post(path: string, body: unknown, token?: string | null) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { token } : {})
    },
    body: JSON.stringify(body ?? {})
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(data.msg || '请求失败')
  return data
}

async function get(path: string, token?: string | null) {
  const res = await fetch(BASE + path, { headers: token ? { token } : {} })
  const data = await res.json()
  if (data.code !== 0) throw new Error(data.msg || '请求失败')
  return data
}

export const api = {
  health: () => get('/health'),
  syncPush: (payload: unknown, token?: string | null) => post('/sync/push', payload, token),
  syncPull: (token?: string | null) => get('/sync/pull', token)
}
