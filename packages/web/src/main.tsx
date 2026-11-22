import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/fraunces/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createCognitoAuth } from './auth/cognito';
import './styles.css';
import { tokensToCss } from './theme/tokens';
import { createApiClient } from './trpc';

const tokenStyle = document.createElement('style');
tokenStyle.textContent = `:root {
${tokensToCss()}
}`;
document.head.appendChild(tokenStyle);

// Set at build time (see packages/web/README.md). These identify the pool; they are not secrets.
const auth = createCognitoAuth({
  userPoolId: import.meta.env.VITE_USER_POOL_ID ?? '',
  clientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App auth={auth} createClient={createApiClient} />
  </StrictMode>,
);
