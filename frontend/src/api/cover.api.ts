export const coverApi = {
  buildFallbackCover(title: string): string {
    const safe = title.replace(/[<>&]/g, '').slice(0, 18) || 'Podcast';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#4f46e5"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="3000" height="3000" fill="url(#g)"/><circle cx="2350" cy="650" r="360" fill="rgba(255,255,255,.18)"/><text x="220" y="1450" font-size="220" font-family="Arial, sans-serif" fill="#fff" font-weight="700">AI Podcast</text><text x="220" y="1780" font-size="150" font-family="Arial, sans-serif" fill="#eef2ff">${safe}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  },
};

