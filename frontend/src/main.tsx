import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CitizenApp from './CitizenApp.tsx'
import { LangProvider } from './i18n.tsx'
import OfficialApp from './OfficialApp.tsx'

// Two portals from one build: /official for municipal staff, everything else for citizens.
const isOfficial = window.location.pathname.replace(/\/+$/, '') === '/official'
document.title = isOfficial ? 'GalliGraph · Officer Console' : 'GalliGraph · Your city. Your voice.'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>{isOfficial ? <OfficialApp /> : <CitizenApp />}</LangProvider>
  </StrictMode>,
)
