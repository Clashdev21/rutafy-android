/**
 * Prueba POST /v1/services y muestra JSON completo (auditoría PIN).
 * Uso: RUTAFY_PHONE=... RUTAFY_PASSWORD=... RUTAFY_COMPANY_ID=uuid node scripts/probe-create-service.mjs
 */
const BASE = process.env.RUTAFY_API_URL || 'https://api.rutafy.app';

async function main() {
  const phone = process.env.RUTAFY_PHONE;
  const password = process.env.RUTAFY_PASSWORD;
  const companyId = process.env.RUTAFY_COMPANY_ID;

  if (!phone || !password || !companyId) {
    console.error(
      'Faltan env: RUTAFY_PHONE, RUTAFY_PASSWORD, RUTAFY_COMPANY_ID (requester_company_id / actor_id)',
    );
    process.exit(1);
  }

  const loginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.access_token || loginJson.accessToken;
  if (!token) {
    console.error('Login falló:', JSON.stringify(loginJson, null, 2));
    process.exit(1);
  }

  const nodesRes = await fetch(`${BASE}/v1/nodes?is_active=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const nodesJson = await nodesRes.json();
  const nodes = nodesJson.nodes || [];
  const withCoords = nodes.filter(
    (n) => Number.isFinite(n.lat) && Number.isFinite(n.lng),
  );
  if (withCoords.length < 2) {
    console.error('Se necesitan al menos 2 nodos con lat/lng:', nodesJson);
    process.exit(1);
  }

  const origin = withCoords[0];
  const dest = withCoords[1];

  const payload = {
    requester_company_id: companyId,
    service_type: 'DOCS',
    request_mode: 'NOW',
    origin: origin.name,
    destination: dest.name,
    origin_node_id: origin.node_id,
    destination_node_id: dest.node_id,
    origin_lat: origin.lat,
    origin_lng: origin.lng,
    destination_lat: dest.lat,
    destination_lng: dest.lng,
  };

  const createRes = await fetch(`${BASE}/v1/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await createRes.text();
  let created;
  try {
    created = JSON.parse(text);
  } catch {
    created = { raw: text };
  }

  console.log('\n=== [create-service-response] status', createRes.status, '===');
  console.log(JSON.stringify(created, null, 2));

  const row = created && typeof created === 'object' ? created : {};
  console.log('\n=== [create-service-audit] ===');
  console.log(
    JSON.stringify(
      {
        hasClosePin: 'close_pin' in row,
        hasClosePinCamel: 'closePin' in row,
        hasCloseCode: 'close_code' in row,
        close_pin: row.close_pin ?? null,
        closePin: row.closePin ?? null,
        nestedService: row.service ?? null,
        nestedData: row.data ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
