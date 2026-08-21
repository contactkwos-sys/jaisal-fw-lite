import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/base.css'
import './styles/app.css'
import './styles/yarn-stock.css'
import './styles/warp-yarn.css'
import './styles/design-costing.css'
import './styles/sample-job-card.css'
import './styles/design-wise-costing.css'
import './styles/design-catalog.css'
import './styles/crm-customers.css'
import './styles/design-to-order.css'
import './styles/hr-payroll.css'
import './styles/program-dispatch.css'
import './styles/security-inventory.css'
import './styles/machine-maintenance.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
