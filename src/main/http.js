'use strict';
// One place for HTTP + error mapping. Errors carry a `code` the UI reacts to:
//   BAD_KEY  -> the key is wrong/expired/revoked: the app sends the user to that option's edit page
//   NETWORK  -> could not connect

const TIMEOUT_MS = 3 * 60 * 1000; // a hung connection must not freeze the app forever

async function requestJSON(method, url, headers, body, label) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') {
      throw Object.assign(new Error(`${label} took too long to answer. Try again, or use a faster model.`), { code: 'NETWORK' });
    }
    throw Object.assign(
      new Error(`Could not reach ${label}. ${e.cause?.code === 'ECONNREFUSED' ? 'Is it running?' : 'Check your connection.'}`),
      { code: 'NETWORK' }
    );
  }
  const text = await res.text();
  if (res.ok) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} sent a reply that is not valid JSON. Check the provider address.`);
    }
  }

  let msg = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    msg = j.error?.message || j.message || (typeof j.error === 'string' ? j.error : '') || msg;
  } catch {
    /* keep raw text */
  }
  const keyProblem =
    res.status === 401 ||
    (res.status === 400 && /api[ _-]?key/i.test(msg)) ||
    (res.status === 403 && /key|permission|denied|leaked|disabled|unauthori/i.test(msg));
  let message = `${label} error ${res.status}: ${msg}`;
  if (keyProblem) message = `${label} rejected the API key (it may be wrong, expired or revoked).`;
  else if (res.status === 429) message = 'Rate limit or free quota reached. Wait a bit, or pick a lighter/faster model.';
  throw Object.assign(new Error(message), { status: res.status, code: keyProblem ? 'BAD_KEY' : undefined });
}

module.exports = { requestJSON };
