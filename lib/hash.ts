// SHA-256 helpers usable from both client (Web Crypto) and server (Node Crypto).

export async function sha256Hex(text: string): Promise<string> {
  // Web Crypto path — works in browser and in modern Node (subtle is global).
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Node fallback
  const { createHash } = await import('crypto');
  return createHash('sha256').update(text).digest('hex');
}
