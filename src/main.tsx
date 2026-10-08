import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { initFontScale } from '@/services/fontScale'
import { initPlatform } from '@/services/platform'
import { initTheme } from '@/services/theme'
import './index.css'

initTheme()
initFontScale()
void initPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
