import React from 'react';
import ReactDOM from 'react-dom/client';
import './monaco.js';
import App from './App.jsx';
import { ForgeProvider } from './store/ForgeContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ForgeProvider>
      <App />
    </ForgeProvider>
  </React.StrictMode>
);
