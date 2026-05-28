const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const STABILITY_API_KEY = Deno.env.get('Stability_API_KEY')
const REMOVEBG_API_KEY = Deno.env.get('Remove_bg')
const PHOTOROOM_API_KEY = Deno.env.get('photoroom_api')
const HUGGINGFACE_API_KEY = Deno.env.get('Hugging_Face_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 1
const RETRY_DELAYS = [3000, 5000]

interface RequestBody {
  image_url: string
  project_id: string
  image_id: string
  user_id: string
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  const resp = await fetch(imageUrl)
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`)
  const arrayBuffer = await resp.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

const BG_REMOVE_PROMPT = 'Remove the background from this image completely. Make the background fully transparent/white. Keep only the jewelry item itself with no background elements, shadows on background, or surface reflections. Output a clean product photo of just the jewelry on a pure white background.'

// Provider 0a: Remove.bg (dedicated bg removal, 50 free calls/month)
async function removeWithRemoveBg(imageBase64: string): Promise<{ image_base64: string }> {
  if (!REMOVEBG_API_KEY) throw new Error('Remove_bg not configured')

  const binaryStr = atob(imageBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const imageBlob = new Blob([bytes], { type: 'image/png' })

  const formData = new FormData()
  formData.append('image_file', imageBlob, 'image.png')
  formData.append('size', 'auto')
  formData.append('bg_color', 'ffffff')

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': REMOVEBG_API_KEY },
    body: formData,
  })

  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Remove.bg error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const resultBytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < resultBytes.length; i++) binary += String.fromCharCode(resultBytes[i])
  return { image_base64: btoa(binary) }
}

// Provider 0b: Photoroom (dedicated bg removal, ~5k free calls/month)
async function removeWithPhotoroom(imageBase64: string): Promise<{ image_base64: string }> {
  if (!PHOTOROOM_API_KEY) throw new Error('photoroom_api not configured')

  const binaryStr = atob(imageBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const imageBlob = new Blob([bytes], { type: 'image/png' })

  const formData = new FormData()
  formData.append('image_file', imageBlob, 'image.png')
  formData.append('bg_color', 'FFFFFF')

  const response = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': PHOTOROOM_API_KEY, Accept: 'image/png' },
    body: formData,
  })

  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Photoroom error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const resultBytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < resultBytes.length; i++) binary += String.fromCharCode(resultBytes[i])
  return { image_base64: btoa(binary) }
}

// Provider 1: Lovable AI Gateway
async function removeWithLovable(imageBase64: string): Promise<{ image_base64: string }> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: BG_REMOVE_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      }],
      modalities: ['image', 'text'],
    }),
  })

  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) throw new Error(`Lovable gateway error ${response.status}`)

  const result = await response.json()
  const images = result.choices?.[0]?.message?.images
  if (images?.[0]?.image_url?.url) {
    const dataUrl = images[0].image_url.url as string
    return { image_base64: dataUrl.replace(/^data:image\/\w+;base64,/, '') }
  }
  return { image_base64: imageBase64 }
}

// Provider 2: Gemini Direct API (free)
async function removeWithGemini(imageBase64: string): Promise<{ image_base64: string }> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: BG_REMOVE_PROMPT },
            { inlineData: { mimeType: 'image/png', data: imageBase64 } },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )

  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (!response.ok) throw new Error(`Gemini API error ${response.status}`)

  const result = await response.json()
  const parts = result.candidates?.[0]?.content?.parts
  const imagePart = parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
  if (imagePart?.inlineData?.data) {
    return { image_base64: imagePart.inlineData.data }
  }
  return { image_base64: imageBase64 }
}

// Provider 3: Stability AI (remove-background endpoint)
async function removeWithStability(imageBase64: string): Promise<{ image_base64: string }> {
  if (!STABILITY_API_KEY) throw new Error('Stability_API_KEY not configured')

  const binaryStr = atob(imageBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const imageBlob = new Blob([bytes], { type: 'image/png' })

  const formData = new FormData()
  formData.append('image', imageBlob, 'image.png')
  formData.append('output_format', 'png')

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/edit/remove-background', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STABILITY_API_KEY}`,
      Accept: 'image/*',
    },
    body: formData,
  })

  if (response.status === 429) throw new Error('RATE_LIMITED')
  if (response.status === 402 || response.status === 403) throw new Error('CREDITS_EXHAUSTED')
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Stability API error ${response.status}: ${errText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const resultBytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < resultBytes.length; i++) binary += String.fromCharCode(resultBytes[i])
  return { image_base64: btoa(binary) }
}

async function removeWithFallback(imageBase64: string): Promise<{ image_base64: string }> {
  const providers = [
    { name: 'Photoroom', fn: () => removeWithPhotoroom(imageBase64) },
    { name: 'Remove.bg', fn: () => removeWithRemoveBg(imageBase64) },
    { name: 'Gemini Direct', fn: () => removeWithGemini(imageBase64) },
    { name: 'Lovable AI', fn: () => removeWithLovable(imageBase64) },
    { name: 'Stability AI', fn: () => removeWithStability(imageBase64) },
  ]

  for (const provider of providers) {
    const maxRateLimitRetries = provider.name === 'Gemini Direct' ? 2 : 1
    for (let rlAttempt = 0; rlAttempt < maxRateLimitRetries; rlAttempt++) {
      try {
        console.log(`Trying ${provider.name}${rlAttempt > 0 ? ` (rate-limit retry ${rlAttempt})` : ''}...`)
        const result = await provider.fn()
        console.log(`✅ ${provider.name} succeeded`)
        return result
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`❌ ${provider.name} failed: ${msg}`)
        if (msg === 'RATE_LIMITED' && rlAttempt < maxRateLimitRetries - 1) {
          const rlDelay = 5000 * (rlAttempt + 1)
          console.log(`Rate limited, waiting ${rlDelay / 1000}s before retry...`)
          await sleep(rlDelay)
          continue
        }
        break
      }
    }
  }
  throw new Error('All image providers failed')
}

async function removeWithRetry(imageBase64: string, retries = MAX_RETRIES): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await removeWithFallback(imageBase64)
    } catch (error) {
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 30000
        console.log(`BG removal attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`)
        await sleep(delay)
      } else {
        throw error
      }
    }
  }
  throw new Error('Background removal failed after all retries')
}

async function processBgRemoval(jobId: string, imageUrl: string, projectId: string, imageId: string, userId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    await supabase.from('processing_jobs').update({ progress: 20 }).eq('id', jobId)

    const imageBase64 = await fetchImageAsBase64(imageUrl)

    await supabase.from('processing_jobs').update({ progress: 40 }).eq('id', jobId)

    const result = await removeWithRetry(imageBase64)

    await supabase.from('processing_jobs').update({ progress: 70 }).eq('id', jobId)

    const storagePath = `${userId}/${projectId}/originals/nobg_${imageId}.png`
    const binaryStr = atob(result.image_base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
    const uploadBlob = new Blob([bytes], { type: 'image/png' })

    const { error: storageError } = await supabase.storage
      .from('project-images')
      .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })

    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`)

    const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

    await supabase
      .from('project_images')
      .update({ storage_url: publicUrlData.publicUrl, metadata: { bg_removed: true } })
      .eq('id', imageId)

    await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', jobId)

    return { success: true, cleaned_url: publicUrlData.publicUrl }
  } catch (error) {
    console.error('BG removal failed:', error)
    await supabase.from('processing_jobs').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', jobId)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_url, project_id, image_id, user_id } = await req.json() as RequestBody

    if (!image_url || !project_id || !image_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({ project_id, image_id, job_type: 'bg_remove', status: 'processing', progress: 5 })
      .select()
      .single()

    if (jobError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    EdgeRuntime.waitUntil(processBgRemoval(job.id, image_url, project_id, image_id, user_id))

    return new Response(
      JSON.stringify({ success: true, job_id: job.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid request', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
