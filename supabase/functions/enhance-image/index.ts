const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 0
const RETRY_DELAYS = [3000, 5000]

interface SourceImage {
  base64: string
  mimeType: string
}

interface RequestBody {
  image_url: string
  project_id: string
  image_id: string
  user_id: string
}

interface UserApiKeyRow {
  key_type: string
  encrypted_key: string
  is_active: boolean
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getKeyPrefixType(key: string): 'gemini' | 'grok' | 'openai' | 'unknown' {
  const normalized = key.trim()

  if (normalized.startsWith('xk-')) return 'grok'
  if (normalized.startsWith('sk-')) return 'openai'
  if (normalized.startsWith('AIza')) return 'gemini'

  return 'unknown'
}

async function getUserApiKey(userId: string, keyType: string): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('key_type, encrypted_key, is_active')
    .eq('user_id', userId)
    .eq('key_type', keyType)
    .eq('is_active', true)
    .maybeSingle<UserApiKeyRow>()

  if (error) {
    console.warn(`Failed to load user API key (${keyType}): ${error.message}`)
    return null
  }

  return data?.encrypted_key?.trim() || null
}

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
  const arrayBuffer = await resp.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
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

const ENHANCE_PROMPT = 'Enhance this jewelry product image and completely remove the background. Output the jewelry item on a pure clean white background with no shadows, no surface, no reflections on the background. Improve lighting, sharpen details, increase clarity and color vibrancy. Make it look like a professional e-commerce product photo with the jewelry isolated on a solid white background. Keep the jewelry itself exactly as-is, only improve image quality and remove all background elements. Return the enhanced image.'

// --- Provider 1: Gemini Direct ---
async function enhanceWithGemini(sourceImage: SourceImage, overrideKey?: string | null): Promise<{ image_base64: string }> {
  const key = overrideKey || Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: ENHANCE_PROMPT },
          { inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } },
        ]}],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`Gemini error ${response.status}`)
  const result = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            mimeType?: string
            data?: string
          }
        }>
      }
    }>
  }
  const imagePart = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.mimeType?.startsWith('image/'))
  if (imagePart?.inlineData?.data) return { image_base64: imagePart.inlineData.data }
  return { image_base64: sourceImage.base64 }
}

// --- Provider 2: Lovable AI Gateway ---
async function enhanceWithLovable(sourceImage: SourceImage): Promise<{ image_base64: string }> {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: [
        { type: 'text', text: ENHANCE_PROMPT },
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
  if (dataUrl) return { image_base64: (dataUrl as string).replace(/^data:image\/\w+;base64,/, '') }
  return { image_base64: sourceImage.base64 }
}

// --- Provider 3: OpenAI Image Edit ---
async function enhanceWithOpenAI(sourceImage: SourceImage, overrideKey?: string | null): Promise<{ image_base64: string }> {
  const key = overrideKey || Deno.env.get('OpenAI_Image_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const fd = new FormData()
  fd.append('image', base64ToBlob(sourceImage.base64, sourceImage.mimeType), fileNameForMimeType(sourceImage.mimeType))
  fd.append('prompt', ENHANCE_PROMPT)
  fd.append('model', 'gpt-image-1')
  fd.append('size', '1024x1024')

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  const result = await response.json()
  if (result.data?.[0]?.b64_json) return { image_base64: result.data[0].b64_json }
  throw new Error('OpenAI returned no image')
}

// --- Provider 4: Grok (xAI) ---
async function enhanceWithGrok(sourceImage: SourceImage, overrideKey?: string | null): Promise<{ image_base64: string }> {
  const key = overrideKey || Deno.env.get('GROK_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const response = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-imagine-image',
      prompt: ENHANCE_PROMPT,
      image: { url: toDataUrl(sourceImage) },
      response_format: 'b64_json',
    }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Grok error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  const result = await response.json()
  if (result.data?.[0]?.b64_json) return { image_base64: result.data[0].b64_json }
  const url = result.data?.[0]?.url
  if (url) {
    if (url.startsWith('data:')) return { image_base64: url.replace(/^data:image\/\w+;base64,/, '') }
    const imgResp = await fetch(url)
    return { image_base64: arrayBufferToBase64(await imgResp.arrayBuffer()) }
  }
  throw new Error('Grok returned no image')
}

// --- Provider 5: Stability AI ---
async function enhanceWithStability(sourceImage: SourceImage): Promise<{ image_base64: string }> {
  const key = Deno.env.get('Stability_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const fd = new FormData()
  fd.append('image', base64ToBlob(sourceImage.base64, sourceImage.mimeType), fileNameForMimeType(sourceImage.mimeType))
  fd.append('prompt', 'Enhance jewelry product image with professional studio lighting, sharpen details, increase clarity and vibrancy.')
  fd.append('output_format', 'png')
  fd.append('mode', 'image-to-image')
  fd.append('strength', '0.35')

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: fd,
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Stability error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  return { image_base64: arrayBufferToBase64(await response.arrayBuffer()) }
}

// --- Provider 6: Ideogram v3 Turbo ---
async function enhanceWithIdeogram(sourceImage: SourceImage): Promise<{ image_base64: string }> {
  const key = Deno.env.get('ideogram_v3_turbo_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const fd = new FormData()
  fd.append('image_file', base64ToBlob(sourceImage.base64, sourceImage.mimeType), fileNameForMimeType(sourceImage.mimeType))
  fd.append('image_request', JSON.stringify({
    prompt: 'Enhance this jewelry product photo: professional studio lighting, sharper details, vibrant colors, clean background. Keep the jewelry identical.',
    model: 'V_3',
    magic_prompt_option: 'AUTO',
    style_type: 'REALISTIC',
  }))

  const response = await fetch('https://api.ideogram.ai/remix', {
    method: 'POST',
    headers: { 'Api-Key': key },
    body: fd,
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Ideogram error ${response.status}: ${(await response.text()).slice(0, 240)}`)
  const result = await response.json()
  const imgUrl = result.data?.[0]?.url
  if (imgUrl) {
    const imgResp = await fetch(imgUrl)
    return { image_base64: arrayBufferToBase64(await imgResp.arrayBuffer()) }
  }
  throw new Error('Ideogram returned no image')
}

// --- Provider 7: Imagen 4 (Google) ---
async function enhanceWithImagen(imageBase64: string): Promise<{ image_base64: string }> {
  const key = Deno.env.get('imagen_4_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4:generateImages?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Enhanced professional studio photograph of jewelry: improved lighting, sharper details, vibrant colors, clean background, ultra high quality product photography.',
        referenceImages: [{ referenceImage: { inlineData: { mimeType: 'image/png', data: imageBase64 } }, referenceType: 'STYLE' }],
        config: { numberOfImages: 1, outputOptions: { mimeType: 'image/png' } },
      }),
    }
  )
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`Imagen error ${response.status}`)
  const result = await response.json()
  if (result.generatedImages?.[0]?.image?.imageBytes) return { image_base64: result.generatedImages[0].image.imageBytes }
  throw new Error('Imagen returned no image')
}

// --- Provider 8: Hugging Face ---
async function enhanceWithHuggingFace(imageBase64: string): Promise<{ image_base64: string }> {
  const key = Deno.env.get('Hugging_Face_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const response = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: 'Enhanced professional studio photograph of jewelry with perfect lighting, sharp details, vibrant colors, clean white background' }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 503) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`HuggingFace error ${response.status}`)
  return { image_base64: arrayBufferToBase64(await response.arrayBuffer()) }
}

// --- Provider 9: Flux ---
async function enhanceWithFlux(imageBase64: string): Promise<{ image_base64: string }> {
  const key = Deno.env.get('FLUX_API_KEY') || Deno.env.get('flux_2_pro_API_KEY')
  if (!key) throw new Error('NOT_CONFIGURED')

  const response = await fetch('https://api.bfl.ml/v1/flux-pro-1.1', {
    method: 'POST',
    headers: { 'X-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Enhanced professional studio photograph of jewelry with perfect lighting, sharp details, vibrant colors, clean white background, ultra high quality',
      width: 1024, height: 1024,
    }),
  })
  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Flux error ${response.status}`)
  const { id: taskId } = await response.json()

  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const sr = await fetch(`https://api.bfl.ml/v1/get_result?id=${taskId}`, { headers: { 'X-Key': key } })
    const status = await sr.json()
    if (status.status === 'Ready' && status.result?.sample) {
      const imgResp = await fetch(status.result.sample)
      return { image_base64: arrayBufferToBase64(await imgResp.arrayBuffer()) }
    }
    if (status.status === 'Error') throw new Error('Flux generation failed')
  }
  throw new Error('Flux timeout')
}

// === Fallback chain ===
async function enhanceWithFallback(sourceImage: SourceImage, userId: string): Promise<{ image_base64: string }> {
  const userEnhancementKey = await getUserApiKey(userId, 'enhancement')
  const userKeyType = userEnhancementKey ? getKeyPrefixType(userEnhancementKey) : 'unknown'

  const providers: { name: string; fn: () => Promise<{ image_base64: string }> }[] = [
    { name: userKeyType === 'gemini' ? 'Gemini Direct (Your Key)' : 'Gemini Direct', fn: () => enhanceWithGemini(sourceImage, userKeyType === 'gemini' ? userEnhancementKey : null) },
    { name: userKeyType === 'openai' ? 'OpenAI (Your Key)' : 'OpenAI', fn: () => enhanceWithOpenAI(sourceImage, userKeyType === 'openai' ? userEnhancementKey : null) },
    { name: userKeyType === 'grok' ? 'Grok (xAI) (Your Key)' : 'Grok (xAI)', fn: () => enhanceWithGrok(sourceImage, userKeyType === 'grok' ? userEnhancementKey : null) },
    { name: 'Ideogram', fn: () => enhanceWithIdeogram(sourceImage) },
    { name: 'Stability AI', fn: () => enhanceWithStability(sourceImage) },
    { name: 'Lovable AI', fn: () => enhanceWithLovable(sourceImage) },
  ]

  if (userEnhancementKey && userKeyType === 'unknown') {
    console.warn('User enhancement key is present but prefix is unrecognized, falling back to project providers')
  }

  // Keep retries short so the edge function doesn't get killed mid-flight
  const RATE_LIMIT_WAITS = [5000, 10000] // 5s, 10s

  const errors: string[] = []
  for (const provider of providers) {
    const maxRateLimitRetries = provider.name.includes('Gemini Direct') ? 2 : 1
    for (let rl = 0; rl <= maxRateLimitRetries; rl++) {
      try {
        console.log(`Trying ${provider.name}${rl > 0 ? ` (retry ${rl})` : ''}...`)
        const result = await provider.fn()
        console.log(`✅ ${provider.name} succeeded`)
        return result
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`❌ ${provider.name} failed: ${msg}`)
        if (rl === 0) errors.push(`${provider.name}: ${msg}`)
        if (msg === 'NOT_CONFIGURED') break
        if (msg === 'CREDITS_EXHAUSTED') break
        if (msg === 'RATE_LIMITED' && rl < maxRateLimitRetries) {
          const waitMs = RATE_LIMIT_WAITS[Math.min(rl, RATE_LIMIT_WAITS.length - 1)]
          console.log(`Rate limited, waiting ${waitMs / 1000}s before retry ${rl + 1}...`)
          await sleep(waitMs)
          continue
        }
        break
      }
    }
  }
  throw new Error(`All providers failed: ${summarizeProviderErrors(errors)}`)
}

async function enhanceWithRetry(sourceImage: SourceImage, userId: string, retries = MAX_RETRIES): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await enhanceWithFallback(sourceImage, userId)
    } catch (error) {
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 30000
        console.log(`Enhancement attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`)
        await sleep(delay)
      } else throw error
    }
  }
  throw new Error('Enhancement failed after all retries')
}

async function processEnhancement(jobId: string, imageUrl: string, projectId: string, imageId: string, userId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Safety timeout: mark job failed if processing takes too long (edge functions have ~150s limit)
  const safetyTimer = setTimeout(async () => {
    console.error('Safety timeout reached — marking job as failed')
    await supabase.from('processing_jobs').update({
      status: 'failed', error_message: 'Processing timed out. Please retry.',
    }).eq('id', jobId).eq('status', 'processing')
  }, 120_000) // 120s safety net

  try {
    await supabase.from('processing_jobs').update({ progress: 30 }).eq('id', jobId)
    const sourceImage = await fetchImageAsBase64(imageUrl)
    const result = await enhanceWithRetry(sourceImage, userId)
    await supabase.from('processing_jobs').update({ progress: 70 }).eq('id', jobId)

    const storagePath = `${userId}/${projectId}/enhanced/enhanced_${imageId}.png`
    const uploadBlob = base64ToBlob(result.image_base64)
    const { error: storageError } = await supabase.storage
      .from('project-images')
      .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })
    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`)

    const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)
    await supabase.from('project_images').insert({
      project_id: projectId, storage_url: publicUrlData.publicUrl, type: 'enhanced',
      metadata: { original_image_id: imageId },
    })
    await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', jobId)
    await supabase.rpc('increment_usage', { p_user_id: userId, p_field: 'images_enhanced' })
  } catch (error) {
    console.error('Enhancement failed:', error)
    await supabase.from('processing_jobs').update({
      status: 'failed', error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', jobId)
  } finally {
    clearTimeout(safetyTimer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { image_url, project_id, image_id, user_id } = await req.json() as RequestBody
    if (!image_url || !project_id || !image_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({ project_id, image_id, job_type: 'enhance', status: 'processing', progress: 5 })
      .select().single()
    if (jobError) {
      return new Response(JSON.stringify({ error: 'Failed to create job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    EdgeRuntime.waitUntil(processEnhancement(job.id, image_url, project_id, image_id, user_id))
    return new Response(JSON.stringify({ success: true, job_id: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid request', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
