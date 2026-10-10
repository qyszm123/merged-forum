import axios from 'axios'

// 统一封装：自动挂载 Bearer Token，并解包后端约定响应 { code, message, data }
//
// baseURL：本地开发留空，走 Vite 的 /api 代理；
//          静态部署（GitHub Pages 等没有同源后端）时用 VITE_API_BASE 指向独立后端，
//          例如 VITE_API_BASE=https://xxx.trycloudflare.com npm run build
//          axios 会把 baseURL 拼在 '/api/xxx' 前面。
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || '' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return body ? body.data : res.data
  },
  (err) => {
    if (err.response && err.response.data && err.response.data.message) {
      return Promise.reject(new Error(err.response.data.message))
    }
    return Promise.reject(err)
  }
)

export default api
