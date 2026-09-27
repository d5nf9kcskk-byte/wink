import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import App from './App'
import { WinkProvider } from './data/store'
import { initMotion } from './lib/motion'

initMotion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WinkProvider>
      <App />
    </WinkProvider>
  </StrictMode>,
)
