// Fetches a product photo so the app can save its own copy.
// Only returns real photos (JPEG, PNG, WebP, GIF) up to 4 MB.
exports.handler = async (event) => {
  const bad = (statusCode, body) => ({ statusCode, body });
  let url;
  try { url = new URL((event.queryStringParameters || {}).u || ""); } catch (e) { return bad(400, "Bad link"); }
  const h = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":") || h.endsWith(".local") || h.endsWith(".internal")) {
    return bad(400, "Link not allowed");
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StockroomImageFetch/1.0)", Accept: "image/*" },
    });
    clearTimeout(timer);
    const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return bad(422, "Not a supported image");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return bad(413, "Image too large");
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
      body: buf.toString("base64"),
    };
  } catch (e) { return bad(502, "Could not fetch image"); }
};
