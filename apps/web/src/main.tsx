import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { loadSpriteManifest } from './lib/sprites';
import { applyTheme, useSettings } from './stores/settings';
import './styles.css';

applyTheme(useSettings.getState().theme);
useSettings.subscribe((state) => applyTheme(state.theme));
void loadSpriteManifest();

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
