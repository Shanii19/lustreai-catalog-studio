import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

type Result = { provider: string; ok: boolean; status: number | null; note: string }

async function check(name: string, fn: () => Promise<Response>): Promise<Result> {
  try {
    const r = await fn()
    const text = await r.text().catch(() => '')
    const snippet = text.slice(0, 200)
    let note = `HTTP ${r.status}`
    if (r.status === 401 || r.status === 403) note = `AUTH/FORBIDDEN — key invalid or revoked. ${snippet}`
    else if (r.status === 402) note = `CREDITS EXHAUSTED. ${snippet}`
    else if (r.status === 429) note = `RATE LIMITED. ${snippet}`
    else if (r.status >= 400) note = `ERROR. ${snippet}`
    else note = `OK`
    return { provider: name, ok: r.status < 400, status: r.status, note }
  } catch (e) {
    return { provider: name, ok: false, status: null, note: `NETWORK ERROR: ${e instanceof Error ? e.message : String(e)}` }
  }
}

function withTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const GEMINI = Deno.env.get('GEMINI_API_KEY')
  const LOVABLE = Deno.env.get('LOVABLE_API_KEY')
  const OPENAI = Deno.env.get('OpenAI_Image_API_KEY')
  const GROK = Deno.env.get('GROK_API_KEY')
  const STABILITY = Deno.env.get('Stability_API_KEY')
  const IDEOGRAM = Deno.env.get('ideogram_v3_turbo_API_KEY')
  const IMAGEN = Deno.env.get('imagen_4_API_KEY')
  const HF = Deno.env.get('Hugging_Face_API_KEY')
  const FLUX = Deno.env.get('FLUX_API_KEY') || Deno.env.get('flux_2_pro_API_KEY')
  const REMOVEBG = Deno.env.get('Remove_bg')
  const PHOTOROOM = Deno.env.get('photoroom_api')
  const CLIPDROP = Deno.env.get('clipdrop_api')

  const results: Result[] = []
  const F = withTimeout

  // Gemini (used for enhance, model, zoom, bg-remove)
  results.push(await check('Gemini (GEMINI_API_KEY)', () =>
    F(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI}`)
  ))

  // Imagen
  results.push(await check('Imagen-4 (imagen_4_API_KEY)', () =>
    F(`https://generativelanguage.googleapis.com/v1beta/models?key=${IMAGEN}`)
  ))

  // Lovable AI Gateway
  results.push(await check('Lovable AI Gateway (LOVABLE_API_KEY)', () =>
    F('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash-lite', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    })
  ))

  // OpenAI Images
  results.push(await check('OpenAI Images (OpenAI_Image_API_KEY)', () =>
    F('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${OPENAI}` } })
  ))

  // Grok / xAI
  results.push(await check('Grok xAI (GROK_API_KEY)', () =>
    F('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${GROK}` } })
  ))

  // Stability
  results.push(await check('Stability (Stability_API_KEY)', () =>
    F('https://api.stability.ai/v1/user/account', { headers: { Authorization: `Bearer ${STABILITY}` } })
  ))

  // Ideogram (no public balance endpoint; do tiny remix probe with HEAD-ish)
  results.push(await check('Ideogram (ideogram_v3_turbo_API_KEY)', () =>
    F('https://api.ideogram.ai/api/v1/images', { headers: { 'Api-Key': IDEOGRAM || '' } })
  ))

  // Hugging Face
  results.push(await check('Hugging Face (Hugging_Face_API_KEY)', () =>
    F('https://huggingface.co/api/whoami-v2', { headers: { Authorization: `Bearer ${HF}` } })
  ))

  // FLUX / BFL
  results.push(await check('FLUX BFL (FLUX_API_KEY)', () =>
    F('https://api.bfl.ml/v1/get_result?id=test', { headers: { 'X-Key': FLUX || '' } })
  ))

  // Remove.bg
  results.push(await check('Remove.bg (Remove_bg)', () =>
    F('https://api.remove.bg/v1.0/account', { headers: { 'X-Api-Key': REMOVEBG || '' } })
  ))

  // Photoroom
  results.push(await check('Photoroom (photoroom_api)', () =>
    F('https://image-api.photoroom.com/v2/account', { headers: { 'x-api-key': PHOTOROOM || '' } })
  ))

  // Clipdrop
  results.push(await check('Clipdrop (clipdrop_api)', () =>
    F('https://clipdrop-api.co/remove-background/v1', { method: 'POST', headers: { 'x-api-key': CLIPDROP || '' } })
  ))

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
