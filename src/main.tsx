import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './ui.css'

// 先应用本机保存的主题，避免刷新时闪一下默认色
document.documentElement.dataset.theme = localStorage.getItem('xiaoman-theme') ?? 'amber'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
