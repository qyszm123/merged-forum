import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ThemeProvider } from './theme.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './styles.css'

// 部署在子路径（GitHub Pages 的 /merged-forum/）时，路由必须带同样的 basename，
// 否则首页和详情页都匹配不上。BASE_URL 由 Vite 依据 build.base 注入。
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
