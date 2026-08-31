import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/base.css'
import '../styles/typography.css'
import './styles/app.css'
import './styles/yarn-stock.css'
import './styles/warp-yarn.css'
import './styles/design-costing.css'
import './styles/sample-job-card.css'
import './styles/design-wise-costing.css'
import './styles/design-catalog.css'
import './styles/crm-customers.css'
import './styles/design-to-order.css'
import './styles/rate-master.css'
import './styles/hr-payroll.css'
import './styles/program-dispatch.css'
import './styles/security-inventory.css'
import './styles/security-machine-update.css'
import './styles/machine-maintenance.css'
import './styles/machine-wise-production.css'
import './styles/ceo-pin-management.css'
import './styles/order-entry.css'
import './styles/daily-pending-work.css'
import './styles/notebook.css'
import './styles/order-to-program.css'
import './styles/record-actions.css'

import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
