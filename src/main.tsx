import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/base.css'
import './styles/app.css'
import './styles/design-costing.css'
import './styles/sample-job-card.css'
import './styles/design-wise-costing.css'
import './styles/design-catalog.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
