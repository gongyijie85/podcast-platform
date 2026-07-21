import { onRequest as onApiRequest } from '../frontend/functions/api/[[path]].js';
import { onRequest as onSocketRequest } from '../frontend/functions/socket.io/[[path]].js';

const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (url, init) => {
  calls.push({ url: url instanceof Request ? url.url : String(url), init });
  return new Response('ok');
};

try {
  const request = new Request('https://pages.example.com/api/health?x=1', {
    method: 'POST',
    body: 'ping',
  });
  const response = await onApiRequest({
    env: { BACKEND_URL: 'https://backend.example.com/' },
    params: { path: ['health'] },
    request,
  });

  if (response.status !== 307) throw new Error(`unexpected status ${response.status}`);
  if (response.headers.get('location') !== 'https://backend.example.com/api/health?x=1') {
    throw new Error(`unexpected redirect target ${response.headers.get('location')}`);
  }

  const socketRequest = new Request('https://pages.example.com/socket.io/?EIO=4&transport=polling');
  const socketResponse = await onSocketRequest({
    env: { BACKEND_URL: 'https://backend.example.com' },
    params: { path: [] },
    request: socketRequest,
  });
  if (socketResponse.status !== 307) throw new Error(`unexpected socket status ${socketResponse.status}`);
  if (socketResponse.headers.get('location') !== 'https://backend.example.com/socket.io/?EIO=4&transport=polling') {
    throw new Error(`unexpected socket redirect target ${socketResponse.headers.get('location')}`);
  }

  const missingConfig = await onApiRequest({
    env: {},
    params: { path: ['health'] },
    request: new Request('https://pages.example.com/api/health'),
  });
  if (missingConfig.status !== 500) throw new Error(`unexpected missing-config status ${missingConfig.status}`);

  console.log('cloudflare proxy check ok');
} finally {
  globalThis.fetch = originalFetch;
}
