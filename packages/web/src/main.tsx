import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createCognitoAuth } from './auth/cognito';
import { loadConfig } from './config';
import { ConfigMissing } from './pages/ConfigMissing';
import './styles.css';
import { tokensToCss } from './theme/tokens';
import { createApiClient } from './trpc';

const tokenStyle = document.createElement('style');
tokenStyle.textContent = `:root {
${tokensToCss()}
}`;
document.head.appendChild(tokenStyle);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Set at build time (see packages/web/README.md). These identify the pool; they are not secrets.
const config = loadConfig(import.meta.env);

createRoot(root).render(
  <StrictMode>
    {config.ok ? (
      <App
        auth={createCognitoAuth({
          userPoolId: config.config.userPoolId,
          clientId: config.config.clientId,
        })}
        createClient={createApiClient}
      />
    ) : (
      <ConfigMissing missing={config.missing} />
    )}
  </StrictMode>,
);
