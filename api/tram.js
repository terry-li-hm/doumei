const ALLOWED_STOPS = ['10W'];
const TRAM_API = 'https://www.hktramways.com/nextTram/geteat.php';

function corsHeaders() {
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

  if (!ALLOWED_STOPS.includes(stop)) {
    return new Response(JSON.stringify({ error: 'Invalid stop' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  try {
    const res = await fetch(`${TRAM_API}?stop_code=${stop}&lang=en`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    // Parse tram ETAs from XML
    const etas = [];
    const tramRegex = /<tram_id>([^<]*)<\/tram_id>[\s\S]*?<eat>([^<]*)<\/eat>[\s\S]*?<dest_stop_code>([^<]*)<\/dest_stop_code>[\s\S]*?<is_arrived>([^<]*)<\/is_arrived>/g;
    let match;
    while ((match = tramRegex.exec(xml)) !== null) {
      if (match[4] === '1') continue; // skip already arrived
      etas.push({
        tram_id: match[1],
        eta: match[2],
        dest_stop_code: match[3],
        is_arrived: match[4] === '1',
      });
    }

    // Fallback: try simpler <eat> extraction if structured regex fails
    if (etas.length === 0) {
      const simpleRegex = /<eat>([^<]+)<\/eat>/g;
      let m;
      while ((m = simpleRegex.exec(xml)) !== null) {
        etas.push({ eta: m[1] });
      }
    }

    return new Response(JSON.stringify({ data: etas, raw_length: xml.length }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (err) {
    return new Response(JSON.stringify({ data: [], error: err.message }), {
      status: 200,
      headers: corsHeaders(),
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}
