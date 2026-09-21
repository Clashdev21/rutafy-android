/**
 * Stub de expo/fetch. Solo I/O de red hoja: el POST productivo vive en src/.
 * El handler es inyectable para hang / 401 / network / 200.
 */

let inFlight = 0;
let maxInFlight = 0;
const calls = [];

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  };
}

function abortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

async function defaultOk() {
  return jsonResponse({ accepted: 0 }, 200);
}

let handler = defaultOk;

export function fetch(url, init = {}) {
  const call = {
    url: String(url),
    method: init.method ?? 'GET',
    headers: { ...(init.headers ?? {}) },
    body: init.body ?? null,
    signal: init.signal ?? null,
  };
  calls.push(call);
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);

  return Promise.resolve()
    .then(() => handler(url, init))
    .finally(() => {
      inFlight -= 1;
    });
}

export function __setExpoFetchHandler(next) {
  handler = typeof next === 'function' ? next : defaultOk;
}

export function __expoFetchHangUntilAbort(_url, init) {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      return;
    }
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        reject(abortError());
      },
      { once: true },
    );
  });
}

export function __expoFetchJson(body, status = 200) {
  return async () => jsonResponse(body, status);
}

export function __getExpoFetchCalls() {
  return calls.slice();
}

export function __getExpoFetchInFlight() {
  return { inFlight, maxInFlight };
}

export function __resetExpoFetch() {
  inFlight = 0;
  maxInFlight = 0;
  calls.length = 0;
  handler = defaultOk;
}
