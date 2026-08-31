import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'

// Vendor CSS first, then our design system so our tokens/overrides win.
import 'bootstrap/dist/css/bootstrap.min.css'
import 'remixicon/fonts/remixicon.css'
import './styles/index.css'

// This is the one place plain JS hands control to React: it finds the
// <div id="root"> from index.html and tells React to render <App /> into it.
// BrowserRouter enables client-side routing (react-router-dom) so links like
// /accounts or /media change the page without a full browser reload.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
