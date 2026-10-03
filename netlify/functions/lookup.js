// Looks up a UPC on UPCitemdb and returns a simple, cleaned-up result.
// Works with no key (free trial limits). To use a paid key, set UPCITEMDB_KEY in Netlify.
exports.handler = async (event) => {
  const json = (statusCode, body, cache) => ({
    statusCode,
    headers: { "Content-Type": "application/json", ...(cache ? { "Cache-Control": "public, max-age=86400" } : {}) },
    body: JSON.stringify(body),
  });
  const upc = String((event.queryStringParameters || {}).upc || "").replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(upc)) return json(400, { error: "That UPC does not look valid." });

  const key = process.env.UPCITEMDB_KEY;
  const url = (key ? "https://api.upcitemdb.com/prod/v1/lookup" : "https://api.upcitemdb.com/prod/trial/lookup") + "?upc=" + upc;
  const headers = { Accept: "application/json" };
  if (key) { headers.user_key = key; headers.key_type = "3scale"; }

  try {
    const r = await fetch(url, { headers });
    if (r.status === 429) return json(429, { error: "Lookup limit reached. Wait a minute and try again, or try again tomorrow." });
    if (!r.ok) return json(502, { error: "The product database had a problem. Try again, or type the details." });
    const d = await r.json();
    const it = (d.items || [])[0];
    if (!it) return json(404, { error: "No product found for this UPC. Type the details instead." });
    return json(200, {
      upc,
      title: it.title || "",
      brand: it.brand || "",
      category: String(it.category || "").split(">").pop().trim(),
      description: it.description || "",
      images: (it.images || []).filter((u) => /^https:\/\//i.test(u)).slice(0, 8),
      lowestPrice: it.lowest_recorded_price || null,
      highestPrice: it.highest_recorded_price || null,
    }, true);
  } catch (e) {
    return json(502, { error: "Could not reach the product database. Try again." });
  }
};
