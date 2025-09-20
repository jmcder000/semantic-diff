// export async function getSemanticDiff({ original, summary }) {
//   const res = await fetch('/api/semantic-diff', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ original, summary })
//   });
//   if (!res.ok) {
//     const err = await res.json().catch(() => ({}));
//     throw new Error(err.error || `HTTP ${res.status}`);
//   }
//   return res.json();
// }


export async function getSemanticDiff({ original, intent }) {
  const res = await fetch('/api/semantic-diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ original, intent })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
