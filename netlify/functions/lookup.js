// Looks up a UPC and returns a simple, cleaned-up result.
// 1) UPCitemdb (free, no key needed; set UPCITEMDB_KEY to use a paid plan)
// 2) Go-UPC, only if GO_UPC_KEY is set in Netlify (used when UPCitemdb finds nothing)
const json = (statusCode, body, cache) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...(cache ? { "Cache-Control": "public, max-age=86400" } : {}) },
  body: JSON.stringify(body),
});

async function viaUpcitemdb(upc) {
  const key = process.env.UPCITEMDB_KEY;
  const url = (key ? "https://api.upcitemdb.com/prod/v1/lookup" : "https://api.upcitemdb.com/prod/trial/lookup") + "?upc=" + upc;
  const headers = { Accept: "application/json" };
  if (key) { headers.user_key = key; headers.key_type = "3scale"; }
  try {
    const r = await fetch(url, { headers });
    if (r.status === 404) return { status: "none", http: 404 };
    if (r.status === 429) return { status: "limit", http: 429 };
    if (!r.ok) return { status: "error", http: r.status };
    const it = ((await r.json()).items || [])[0];
    if (!it) return { status: "none", http: 200 };
    return { status: "ok", product: {
      upc, source: "UPCitemdb",
      title: it.title || "", brand: it.brand || "",
      category: String(it.category || "").split(">").pop().trim(),
      description: it.description || "",
      images: (it.images || []).filter((u) => /^https:\/\//i.test(u)).slice(0, 8),
      lowestPrice: it.lowest_recorded_price || null,
      highestPrice: it.highest_recorded_price || null,
    } };
  } catch (e) { return { status: "error", http: "no connection" }; }
}

async function viaGoUpc(upc, key) {
  try {
    const r = await fetch("https://go-upc.com/api/v1/code/" + upc, {
      headers: { Accept: "application/json", Authorization: "Bearer " + key },
    });
    if (r.status === 404) return { status: "none", http: 404 };
    if (r.status === 429) return { status: "limit", http: 429 };
    if (!r.ok) return { status: "error", http: r.status }; // 401 means a bad key
    const p = (await r.json()).product;
    if (!p || !p.name) return { status: "none", http: 200 };
    return { status: "ok", product: {
      upc, source: "Go-UPC",
      title: p.name, brand: p.brand || "", category: p.category || "",
      description: p.description || "",
      images: p.imageUrl && /^https:\/\//i.test(p.imageUrl) ? [p.imageUrl] : [],
      lowestPrice: null, highestPrice: null,
    } };
  } catch (e) { return { status: "error", http: "no connection" }; }
}

exports.handler = async (event) => {
  const upc = String((event.queryStringParameters || {}).upc || "").replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(upc)) return json(400, { error: "That UPC does not look valid." });

  const results = [await viaUpcitemdb(upc)];
  results[0].name = "UPCitemdb";
  if (results[0].status !== "ok") {
    if (process.env.GO_UPC_KEY) {
      const g = await viaGoUpc(upc, process.env.GO_UPC_KEY);
      g.name = "Go-UPC";
      results.push(g);
    } else {
      results.push({ name: "Go-UPC", status: "skipped", http: "no GO_UPC_KEY set in Netlify" });
    }
  }
  const detail = results.map((r) => r.name + ": " + r.status + (r.http ? " (" + r.http + ")" : "")).join("; ");
  const hit = results.find((r) => r.status === "ok");
  if (hit) return json(200, hit.product, true);
  if (results.every((r) => r.status === "none" || r.status === "skipped")) return json(404, { error: "No product found for this UPC. Type the details instead.", detail });
  if (results.some((r) => r.status === "limit")) return json(429, { error: "Lookup limit reached. Wait a minute and try again, or try again tomorrow.", detail });
  return json(502, { error: "The product database had a problem. Try again, or type the details.", detail });
};
