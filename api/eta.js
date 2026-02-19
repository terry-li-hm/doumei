const STOP_ROUTES = {
  '001293': ['77', '99'],                              // Primary: Lei King Wan (Grand Promenade)
  '001304': ['2', '77', '82', '85', '99', '720'],     // Plan B: Tai Cheong St, SKW Rd
  '001367': ['102', '106', '682'],                     // Plan B: Tai Fu St, SKW Rd
};
const BASE = 'https://rt.data.gov.hk/v2/transport/citybus/eta/CTB';

function corsHeaders(origin) {
  const allowed = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const stop = (url.searchParams.get('stop') || '').trim();

  const routes = STOP_ROUTES[stop];
  if (!routes) {
    return new Response(JSON.stringify({ error: 'Invalid stop' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const results = await Promise.all(
    routes.map((route) =>
      fetch(`${BASE}/${stop}/${route}`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) return { route, data: [], error: res.status };
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('application/json'))
            return { route, data: [], error: 'bad content-type' };
          const json = await res.json();
          return { route, data: json.data || [] };
        })
        .catch((err) => ({ route, data: [], error: err.name }))
    )
  );

  return new Response(JSON.stringify({ data: results }), {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
