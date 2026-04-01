const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 0
const RETRY_DELAYS = [3000, 5000]
const INTER_REQUEST_DELAY = 35000

interface SourceImage {
  base64: string
  mimeType: string
}

interface RequestBody {
  enhanced_image_url: string
  project_id: string
  image_id: string
  user_id: string
}

const VARIANT_PROMPTS = [
  { variant: 1, suffix: 'close-up portrait, face and neckline visible, soft bokeh background' },
  { variant: 2, suffix: 'half-body shot, elegant pose, hands visible showcasing the jewelry' },
  { variant: 3, suffix: 'full editorial fashion shot, full body, runway style, dramatic lighting' },
]

const BASE_PROMPT = 'A photorealistic Asian female fashion model wearing the exact jewelry from the reference image on her real neck and chest, professional studio lighting, luxury editorial fashion photography, clean premium background, ultra-detailed'
const WEARING_GUARDRAIL = 'The final output must show a real human model clearly wearing the exact necklace from the reference image. Do not generate a standalone product shot, isolated jewelry, floating necklace, mannequin, bust display, or empty background with only the jewelry. Preserve the exact pendant shape, gemstone colors, chain structure, and ornament placement from the reference.'

async function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }

function normalizeMimeType(contentType: string | null): string {
  const mimeType = contentType?.split(';')[0]?.trim().toLowerCase()
  if (!mimeType?.startsWith('image/')) return 'image/png'
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
}

function fileNameForMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'image.jpeg'
  if (mimeType === 'image/webp') return 'image.webp'
  return 'image.png'
}

function toDataUrl(sourceImage: SourceImage): string {
  return `data:${sourceImage.mimeType};base64,${sourceImage.base64}`
}

function summarizeProviderErrors(errors: string[]): string {
  const deduped = new Map<string, string>()

  for (const entry of errors) {
    const separatorIndex = entry.indexOf(':')
    const provider = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex)
    const message = separatorIndex === -1 ? 'Unknown error' : entry.slice(separatorIndex + 1).trim()

    if (!deduped.has(provider)) deduped.set(provider, message)
  }

  return Array.from(deduped.entries()).map(([provider, message]) => `${provider}: ${message}`).join('; ')
}

async function fetchImageAsBase64(imageUrl: string): Promise<SourceImage> {
  const resp = await fetch(imageUrl)
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`)
  const bytes = new Uint8Array(await resp.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return {
    base64: btoa(binary),
    mimeType: normalizeMimeType(resp.headers.get('content-type')),
  }
}

function base64ToBlob(b64: string, mime = 'image/png'): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function buildPrompt(suffix: string): string {
  return `${BASE_PROMPT}, ${suffix}. ${WEARING_GUARDRAIL} Generate a photorealistic fashion photograph where the jewelry is naturally draped and proportionally correct on the model.`
}

// --- Provider 1: Gemini Direct ---
async function genGemini(sourceImage: SourceImage, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`Gemini error ${response.status}`)
  const result = await response.json()
  const imagePart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
  if (imagePart?.inlineData?.data) return { image_base64: imagePart.inlineData.data, provider: 'Gemini Direct' }
  throw new Error('Gemini returned no image')
}

// --- Provider 2: OpenAI ---
async function genOpenAI(sourceImage: SourceImage, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('OpenAI_Image_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const fd = new FormData()
  fd.append('image', base64ToBlob(sourceImage.base64, sourceImage.mimeType), fileNameForMimeType(sourceImage.mimeType))
  fd.append('prompt', prompt)
  fd.append('model', 'gpt-image-1')
  fd.append('size', '1024x1024')
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  const result = await response.json()
  if (result.data?.[0]?.b64_json) return { image_base64: result.data[0].b64_json, provider: 'OpenAI' }
  throw new Error('OpenAI returned no image')
}

// --- Provider 3: Lovable AI Gateway ---
async function genLovable(sourceImage: SourceImage, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: toDataUrl(sourceImage) } },
      ]}],
      modalities: ['image', 'text'],
    }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Lovable error ${response.status}`)
  const result = await response.json()
  const dataUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (dataUrl) return { image_base64: (dataUrl as string).replace(/^data:image\/\w+;base64,/, ''), provider: 'Lovable AI' }
  throw new Error('No image returned')
}

// --- Provider 4: Grok (xAI) ---
async function genGrok(sourceImage: SourceImage, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('GROK_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const response = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-imagine-image',
      prompt,
      image: { url: toDataUrl(sourceImage) },
      response_format: 'b64_json',
    }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Grok error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  const result = await response.json()
  if (result.data?.[0]?.b64_json) return { image_base64: result.data[0].b64_json, provider: 'Grok' }
  const url = result.data?.[0]?.url
  if (url) {
    if (url.startsWith('data:')) return { image_base64: url.replace(/^data:image\/\w+;base64,/, ''), provider: 'Grok' }
    return { image_base64: arrayBufferToBase64(await (await fetch(url)).arrayBuffer()), provider: 'Grok' }
  }
  throw new Error('Grok returned no image')
}

// --- Provider 5: Ideogram v3 Turbo ---
async function genIdeogram(sourceImage: SourceImage, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('ideogram_v3_turbo_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const fd = new FormData()
  fd.append('image_file', base64ToBlob(sourceImage.base64, sourceImage.mimeType), fileNameForMimeType(sourceImage.mimeType))
  fd.append('image_request', JSON.stringify({ prompt, model: 'V_3_TURBO', magic_prompt_option: 'AUTO', style_type: 'REALISTIC' }))
  const response = await fetch('https://api.ideogram.ai/remix', { method: 'POST', headers: { 'Api-Key': key }, body: fd })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Ideogram error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  const result = await response.json()
  const imgUrl = result.data?.[0]?.url
  if (imgUrl) return { image_base64: arrayBufferToBase64(await (await fetch(imgUrl)).arrayBuffer()), provider: 'Ideogram' }
  throw new Error('Ideogram returned no image')
}

// --- Provider 6: Stability AI ---
async function genStability(sourceImage: SourceImage, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('Stability_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const fd = new FormData()
  fd.append('image', base64ToBlob(sourceImage.base64, sourceImage.mimeType), fileNameForMimeType(sourceImage.mimeType))
  fd.append('prompt', prompt)
  fd.append('output_format', 'png')
  fd.append('mode', 'image-to-image')
  fd.append('strength', '0.65')
  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' }, body: fd,
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Stability error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  return { image_base64: arrayBufferToBase64(await response.arrayBuffer()), provider: 'Stability AI' }
}

// --- Provider 7: Imagen 4 ---
async function genImagen(_imageBase64: string, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('imagen_4_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4:generateImages?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, config: { numberOfImages: 1, outputOptions: { mimeType: 'image/png' } } }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`Imagen error ${response.status}`)
  const result = await response.json()
  if (result.generatedImages?.[0]?.image?.imageBytes) return { image_base64: result.generatedImages[0].image.imageBytes, provider: 'Imagen 4' }
  throw new Error('Imagen returned no image')
}

// --- Provider 8: Flux ---
async function genFlux(_imageBase64: string, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('FLUX_API_KEY') || Deno.env.get('flux_2_pro_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const response = await fetch('https://api.bfl.ml/v1/flux-pro-1.1', {
    method: 'POST', headers: { 'X-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width: 1024, height: 1024 }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`Flux error ${response.status}`)
  const { id: taskId } = await response.json()
  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const sr = await fetch(`https://api.bfl.ml/v1/get_result?id=${taskId}`, { headers: { 'X-Key': key } })
    const status = await sr.json()
    if (status.status === 'Ready' && status.result?.sample) {
      return { image_base64: arrayBufferToBase64(await (await fetch(status.result.sample)).arrayBuffer()), provider: 'Flux' }
    }
    if (status.status === 'Error') throw new Error('Flux generation failed')
  }
  throw new Error('Flux timeout')
}

// --- Provider 9: Hugging Face ---
async function genHuggingFace(_imageBase64: string, prompt: string): Promise<{ image_base64: string; provider: string }> {
  const key = Deno.env.get('Hugging_Face_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')
  const response = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt }),
  })
  if (response.status === 429 || response.status === 503) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`HuggingFace error ${response.status}`)
  return { image_base64: arrayBufferToBase64(await response.arrayBuffer()), provider: 'Hugging Face' }
}

// === Fallback chain ===
async function generateWithFallback(sourceImage: SourceImage, promptSuffix: string): Promise<{ image_base64: string; provider: string }> {
  const prompt = buildPrompt(promptSuffix)
  const providers: { name: string; fn: () => Promise<{ image_base64: string; provider: string }> }[] = [
    { name: 'Gemini Direct', fn: () => genGemini(sourceImage, prompt) },
    { name: 'OpenAI', fn: () => genOpenAI(sourceImage, prompt) },
    { name: 'Grok (xAI)', fn: () => genGrok(sourceImage, prompt) },
    { name: 'Ideogram', fn: () => genIdeogram(sourceImage, prompt) },
    { name: 'Stability AI', fn: () => genStability(sourceImage, prompt) },
    { name: 'Lovable AI', fn: () => genLovable(sourceImage, prompt) },
  ]

  const errors: string[] = []
  for (const provider of providers) {
    for (let rl = 0; rl < 2; rl++) {
      try {
        console.log(`Trying ${provider.name}${rl > 0 ? ` (retry ${rl})` : ''}...`)
        const result = await provider.fn()
        console.log(`✅ ${provider.name} succeeded`)
        return result
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`❌ ${provider.name} failed: ${msg}`)
        errors.push(`${provider.name}: ${msg}`)
        if (msg === 'NOT_CONFIGURED' || msg === 'CREDITS_EXHAUSTED') break
        if (msg === 'RATE_LIMITED' && rl < 1) { await sleep(5000); continue }
        break
      }
    }
  }
  throw new Error(`All providers failed: ${summarizeProviderErrors(errors)}`)
}

async function generateWithRetry(sourceImage: SourceImage, promptSuffix: string, retries = MAX_RETRIES): Promise<{ image_base64: string; provider: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await generateWithFallback(sourceImage, promptSuffix) }
    catch (error) {
      if (attempt < retries) { await sleep(RETRY_DELAYS[attempt] || 30000) } else throw error
    }
  }
  throw new Error('Model generation failed after all retries')
}

async function processModelRenders(jobId: string, enhancedImageUrl: string, projectId: string, imageId: string, userId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const sourceImage = await fetchImageAsBase64(enhancedImageUrl)
    for (let i = 0; i < VARIANT_PROMPTS.length; i++) {
      const { variant, suffix } = VARIANT_PROMPTS[i]
      await supabase.from('processing_jobs').update({ progress: Math.round(((i * 2 + 1) / (VARIANT_PROMPTS.length * 2)) * 100) }).eq('id', jobId)
      const result = await generateWithRetry(sourceImage, suffix)

      const storagePath = `${userId}/${projectId}/models/${imageId}/variant_${variant}.png`
      const { error: storageError } = await supabase.storage.from('project-images')
        .upload(storagePath, base64ToBlob(result.image_base64), { upsert: true, contentType: 'image/png' })
      if (storageError) throw new Error(`Storage failed variant ${variant}: ${storageError.message}`)

      const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)
      await supabase.from('project_images').insert({
        project_id: projectId, storage_url: publicUrlData.publicUrl, type: 'model',
        metadata: { variant, jewelry_image_id: imageId },
      })
      await supabase.from('processing_jobs').update({ progress: Math.round(((i * 2 + 2) / (VARIANT_PROMPTS.length * 2)) * 100) }).eq('id', jobId)

      if (i < VARIANT_PROMPTS.length - 1) await sleep(INTER_REQUEST_DELAY)
    }
    await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', jobId)
    await supabase.rpc('increment_usage', { p_user_id: userId, p_field: 'models_generated' })
  } catch (error) {
    console.error('Model render failed:', error)
    await supabase.from('processing_jobs').update({
      status: 'failed', error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', jobId)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { enhanced_image_url, project_id, image_id, user_id } = (await req.json()) as RequestBody
    if (!enhanced_image_url || !project_id || !image_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({ project_id, image_id, job_type: 'model_render', status: 'processing', progress: 5 })
      .select().single()
    if (jobError) return new Response(JSON.stringify({ error: 'Failed to create job', details: jobError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    EdgeRuntime.waitUntil(processModelRenders(job.id, enhanced_image_url, project_id, image_id, user_id))
    return new Response(JSON.stringify({ success: true, job_id: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid request', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
