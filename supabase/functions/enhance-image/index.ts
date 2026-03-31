const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GEMINI_MODEL = 'gemini-2.5-flash-image'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 4
const RETRY_DELAYS = [10000, 30000, 60000, 60000] // exponential backoff: 10s, 30s, 60s, 60s

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

async function enhanceWithAI(imageUrl: string): Promise<{ image_base64: string }> {
  const imageBase64 = await fetchImageAsBase64(imageUrl)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Enhance this jewelry product image: improve lighting, sharpen details, increase clarity and color vibrancy, remove any background noise, make it look professional and studio-quality. Keep the jewelry exactly as-is, only improve the image quality. Return the enhanced image.' },
            { inline_data: { mime_type: 'image/png', data: imageBase64 } },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )

  if (response.status === 429) throw new Error('Rate limited — please try again later')
  if (response.status === 404 || response.status === 410) {
    const errText = await response.text()
    throw new Error(`Gemini model unavailable (${response.status}). Verify the model name and availability. ${errText}`)
  }
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errText}`)
  }

  const result = await response.json()
  const parts = result.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData?.data) return { image_base64: part.inlineData.data }
  }

  console.warn('Gemini did not return an image, using original as fallback')
  return { image_base64: imageBase64 }
}

async function enhanceWithRetry(imageUrl: string, retries = MAX_RETRIES): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await enhanceWithAI(imageUrl)
    } catch (error) {
      if (attempt < retries) {
        console.log(`Enhancement attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`)
        await sleep(RETRY_DELAY_MS)
      } else {
        throw error
      }
    }
  }
  throw new Error('Enhancement failed after all retries')
}

async function processEnhancement(jobId: string, imageUrl: string, projectId: string, imageId: string, userId: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    await supabase.from('processing_jobs').update({ progress: 30 }).eq('id', jobId)

    const result = await enhanceWithRetry(imageUrl)

    await supabase.from('processing_jobs').update({ progress: 70 }).eq('id', jobId)

    const storagePath = `${userId}/${projectId}/enhanced/enhanced_${imageId}.png`
    const binaryStr = atob(result.image_base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
    const uploadBlob = new Blob([bytes], { type: 'image/png' })

    const { error: storageError } = await supabase.storage
      .from('project-images')
      .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })

    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`)

    const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

    await supabase.from('project_images').insert({
      project_id: projectId,
      storage_url: publicUrlData.publicUrl,
      type: 'enhanced',
      metadata: { original_image_id: imageId },
    })

    await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', jobId)
    await supabase.rpc('increment_usage', { p_user_id: userId, p_field: 'images_enhanced' })
  } catch (error) {
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
      .insert({ project_id, image_id, job_type: 'enhance', status: 'processing', progress: 5 })
      .select()
      .single()

    if (jobError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process in background — return immediately
    EdgeRuntime.waitUntil(processEnhancement(job.id, image_url, project_id, image_id, user_id))

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
