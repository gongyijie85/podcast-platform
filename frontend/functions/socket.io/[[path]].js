export async function onRequest({ env, params, request }) {
  if (!env.BACKEND_URL) {
    return new Response('BACKEND_URL is not configured', { status: 500 });
  }

  const backend = new URL(env.BACKEND_URL);
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path || '';
  const target = new URL(`/socket.io/${path}`, backend);
  target.search = new URL(request.url).search;
  return Response.redirect(target.toString(), 307);
}
