const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const STABILITY_API_KEY = Deno.env.get('Stability_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 4
const RETRY_DELAYS = [5000, 10000, 20000, 30000]
const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-exp-image-generation'

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

const BASE_PROMPT =
  'A photorealistic Asian female fashion model wearing the exact jewelry from the reference image on her real neck and chest, professional studio lighting, luxury editorial fashion photography, clean premium background, ultra-detailed'

const WEARING_GUARDRAIL =
  'The final output must show a real human model clearly wearing the exact necklace from the reference image. Do not generate a standalone product shot, isolated jewelry, floating necklace, mannequin, bust display, or empty background with only the jewelry. Preserve the exact pendant shape, gemstone colors, chain structure, and ornament placement from the reference.'

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

// Provider 1: Lovable AI Gateway
async function generateWithLovable(imageBase64: string, promptSuffix: string): Promise<{ image_base64: string }> {
  const fullPrompt = `${BASE_PROMPT}, ${promptSuffix}. ${WEARING_GUARDRAIL} Generate a photorealistic fashion photograph where the jewelry is naturally draped and proportionally correct on the model.`

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
          { type: 'text', text: fullPrompt },
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
  throw new Error('No image returned')
}

// Provider 2: Gemini Direct API (free)
async function generateWithGemini(imageBase64: string, promptSuffix: string): Promise<{ image_base64: string }> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const fullPrompt = `${BASE_PROMPT}, ${promptSuffix}. ${WEARING_GUARDRAIL} Generate a photorealistic fashion photograph where the model is visibly wearing the necklace.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: fullPrompt },
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
  throw new Error('Gemini did not return an image')
}

// Provider 3: Stability AI
async function generateWithStability(imageBase64: string, promptSuffix: string): Promise<{ image_base64: string }> {
  if (!STABILITY_API_KEY) throw new Error('Stability_API_KEY not configured')

  const fullPrompt = `${BASE_PROMPT}, ${promptSuffix}. ${WEARING_GUARDRAIL} The necklace must be on the model's neck, not shown alone. Photorealistic fashion photograph.`

  const binaryStr = atob(imageBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const imageBlob = new Blob([bytes], { type: 'image/png' })

  const formData = new FormData()
  formData.append('image', imageBlob, 'image.png')
  formData.append('prompt', fullPrompt)
  formData.append('output_format', 'png')
  formData.append('mode', 'image-to-image')
  formData.append('strength', '0.65')

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
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

async function generateWithFallback(imageBase64: string, promptSuffix: string): Promise<{ image_base64: string }> {
  const providers = [
    { name: 'Gemini Direct', fn: () => generateWithGemini(imageBase64, promptSuffix) },
    { name: 'Lovable AI', fn: () => generateWithLovable(imageBase64, promptSuffix) },
    { name: 'Stability AI', fn: () => generateWithStability(imageBase64, promptSuffix) },
  ]

  for (const provider of providers) {
    try {
      console.log(`Trying ${provider.name}...`)
      const result = await provider.fn()
      console.log(`✅ ${provider.name} succeeded`)
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn(`❌ ${provider.name} failed: ${msg}`)
      if (msg === 'RATE_LIMITED') await sleep(5000)
      continue
    }
  }
  throw new Error('All image providers failed')
}

async function generateWithRetry(imageBase64: string, promptSuffix: string, retries = MAX_RETRIES): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateWithFallback(imageBase64, promptSuffix)
    } catch (error) {
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 30000
        console.log(`Model gen attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`)
        await sleep(delay)
      } else {
        throw error
      }
    }
  }
  throw new Error('Model generation failed after all retries')
}

async function processModelRenders(jobId: string, enhancedImageUrl: string, projectId: string, imageId: string, userId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const enhancedImageBase64 = await fetchImageAsBase64(enhancedImageUrl)

    for (let i = 0; i < VARIANT_PROMPTS.length; i++) {
      const { variant, suffix } = VARIANT_PROMPTS[i]

      const progressPct = Math.round(((i * 2 + 1) / (VARIANT_PROMPTS.length * 2)) * 100)
      await supabase.from('processing_jobs').update({ progress: progressPct }).eq('id', jobId)

      const result = await generateWithRetry(enhancedImageBase64, suffix)

      const storagePath = `${userId}/${projectId}/models/${imageId}/variant_${variant}.png`
      const binaryStr = atob(result.image_base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j)
      const uploadBlob = new Blob([bytes], { type: 'image/png' })

      const { error: storageError } = await supabase.storage
        .from('project-images')
        .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })

      if (storageError) throw new Error(`Storage upload failed for variant ${variant}: ${storageError.message}`)

      const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

      await supabase.from('project_images').insert({
        project_id: projectId,
        storage_url: publicUrlData.publicUrl,
        type: 'model',
        metadata: { variant, jewelry_image_id: imageId },
      })

      const uploadPct = Math.round(((i * 2 + 2) / (VARIANT_PROMPTS.length * 2)) * 100)
      await supabase.from('processing_jobs').update({ progress: uploadPct }).eq('id', jobId)

      if (i < VARIANT_PROMPTS.length - 1) await sleep(2000)
    }

    await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', jobId)
    await supabase.rpc('increment_usage', { p_user_id: userId, p_field: 'models_generated' })
  } catch (error) {
    console.error('Model render failed:', error)
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
    const { enhanced_image_url, project_id, image_id, user_id } = (await req.json()) as RequestBody

    if (!enhanced_image_url || !project_id || !image_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({ project_id, image_id, job_type: 'model_render', status: 'processing', progress: 5 })
      .select()
      .single()

    if (jobError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    EdgeRuntime.waitUntil(processModelRenders(job.id, enhanced_image_url, project_id, image_id, user_id))

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
