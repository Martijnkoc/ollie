// Test-only stand-ins for PDOK (Locatieserver + BAG OGC API) and the Mollie Payments API.
// All data is fictional. Never point a production deployment at this server.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 3201);
const ID = "adr-" + "5a".repeat(16);
const ID2 = "adr-" + "6b".repeat(16);
const VBO = "0000010000000012";
const PAND = "0000100000000034";
const POINT = { lon: 5.1214, lat: 52.0907 };

const addresses = {
  [ID]: { id: ID, type: "adres", weergavenaam: "Voorbeeldstraat 12, 1234AB Voorbeeldstad", straatnaam: "Voorbeeldstraat", huisnummer: 12, postcode: "1234AB", woonplaatsnaam: "Voorbeeldstad", gemeentenaam: "Voorbeeldgemeente", centroide_ll: `POINT(${POINT.lon} ${POINT.lat})`, adresseerbaarobject_id: VBO },
  [ID2]: { id: ID2, type: "adres", weergavenaam: "Voorbeeldstraat 14, 1234AB Voorbeeldstad", straatnaam: "Voorbeeldstraat", huisnummer: 14, postcode: "1234AB", woonplaatsnaam: "Voorbeeldstad", centroide_ll: `POINT(${POINT.lon + 0.0004} ${POINT.lat})`, adresseerbaarobject_id: "0000010000000013" },
};

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const payments = new Map();
let n = 0;

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- PDOK Locatieserver ----
  if (p === "/ls/suggest") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    if (q.includes("traag")) return setTimeout(() => json(res, 200, { response: { numFound: 0, docs: [] } }), 15000);
    if (q.includes("drukte")) return json(res, 429, {});
    if (q.includes("storing")) return json(res, 503, {});
    const docs = q.includes("bestaatniet") ? [] : Object.values(addresses).map(({ id, weergavenaam, type }) => ({ id, weergavenaam, type }));
    return json(res, 200, { response: { numFound: docs.length, start: 0, docs } });
  }
  if (p === "/ls/lookup") {
    const doc = addresses[url.searchParams.get("id")];
    return json(res, 200, { response: { numFound: doc ? 1 : 0, start: 0, docs: doc ? [doc] : [] } });
  }

  // ---- BAG OGC API ----
  if (p === "/bag/collections/verblijfsobject/items") {
    const id = url.searchParams.get("identificatie");
    const features = id === VBO ? [{ type: "Feature", properties: { identificatie: VBO, oppervlakte: 86, gebruiksdoel: "woonfunctie", status: "Verblijfsobject in gebruik", pand: [{ href: `${url.origin}/bag/collections/pand/items/x`, title: PAND }] }, geometry: { type: "Point", coordinates: [POINT.lon, POINT.lat] } }] : [];
    return json(res, 200, { type: "FeatureCollection", features });
  }
  if (p === "/bag/collections/pand/items") {
    const d = 0.00012;
    const ring = [
      [POINT.lon - 2 * d, POINT.lat - d],
      [POINT.lon + 2 * d, POINT.lat - d],
      [POINT.lon + 2 * d, POINT.lat + d],
      [POINT.lon, POINT.lat + 1.6 * d],
      [POINT.lon - 2 * d, POINT.lat + d],
      [POINT.lon - 2 * d, POINT.lat - d],
    ];
    return json(res, 200, { type: "FeatureCollection", features: [{ type: "Feature", properties: { identificatie: PAND, bouwjaar: 1931, status: "Pand in gebruik" }, geometry: { type: "Polygon", coordinates: [ring] } }] });
  }

  // ---- Mollie Payments API (test double) ----
  if (p === "/mollie/v2/payments" && req.method === "POST") {
    if (req.headers.authorization !== "Bearer test_e2emollieabcdefghijklmnop") return json(res, 401, {});
    const b = JSON.parse(await body(req));
    const id = `tr_e2e${++n}`;
    const payment = { resource: "payment", id, mode: "test", status: "open", amount: b.amount, description: b.description, metadata: b.metadata, redirectUrl: b.redirectUrl, _links: { checkout: { href: `${url.origin}/mollie/checkout/${id}` } } };
    payments.set(id, payment);
    return json(res, 201, payment);
  }
  const get = /^\/mollie\/v2\/payments\/(tr_\w+)$/.exec(p);
  if (get) {
    const payment = payments.get(get[1]);
    return payment ? json(res, 200, payment) : json(res, 404, {});
  }
  const checkout = /^\/mollie\/checkout\/(tr_\w+)(\/(pay|cancel))?$/.exec(p);
  if (checkout) {
    const payment = payments.get(checkout[1]);
    if (!payment) return json(res, 404, {});
    if (checkout[3]) {
      payment.status = checkout[3] === "pay" ? "paid" : "canceled";
      if (payment.status === "paid") payment.paidAt = new Date().toISOString();
      res.writeHead(303, { Location: payment.redirectUrl });
      return res.end();
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><html lang="nl"><body><h1>Testbetaalpagina (nep-Mollie)</h1><p>${payment.description} — € ${payment.amount.value}</p>
      <form method="post" action="/mollie/checkout/${payment.id}/pay"><button>Testbetaling voltooien</button></form>
      <form method="post" action="/mollie/checkout/${payment.id}/cancel"><button>Annuleren</button></form></body></html>`);
  }

  json(res, 404, { error: "unknown mock route" });
}).listen(PORT, () => console.log(`mock services on http://localhost:${PORT}`));
