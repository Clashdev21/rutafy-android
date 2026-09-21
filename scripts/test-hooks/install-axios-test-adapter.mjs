/**
 * Instala un adapter axios ANTES de que accessTokenManager haga axios.create.
 * Solo atiende /v1/auth/refresh; el POST de puntos usa expo/fetch.
 */
import axios from 'axios';

globalThis.__DEV__ = false;

let refreshHandler = defaultRefresh;

async function defaultRefresh(config) {
  return {
    data: {
      access_token: 'refreshed-access-token',
      refresh_token: 'rt-rotated',
      expires_in: 3600,
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
}

axios.defaults.adapter = async (config) => {
  const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
  if (url.includes('/v1/auth/refresh')) {
    return refreshHandler(config);
  }
  throw new Error(`[test-axios] unexpected ${config.method ?? 'GET'} ${url}`);
};

export function __setRefreshHandler(next) {
  refreshHandler = typeof next === 'function' ? next : defaultRefresh;
}
