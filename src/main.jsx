import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/poker-mobile-layout.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
