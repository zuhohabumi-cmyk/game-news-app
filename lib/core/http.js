async function request(url, { json = true, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Personal Game News Reader/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
async function mapLimit(items, limit, callback) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; output[index] = await callback(items[index], index); }
  }));
  return output;
}
module.exports = { request, mapLimit };
