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
const RETRY_DELAYS = [10000, 30000, 60000, 60000]

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

async function removeBackground(imageBase64: string): Promise<{ image_base64: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Remove the background from this image completely. Make the background fully transparent/white. Keep only the jewelry item itself with no background elements, shadows on background, or surface reflections. Output a clean product photo of just the jewelry on a pure white background.',
            },
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

  // If no image returned, return original
  console.warn('Gemini did not return an image for bg removal, using original')
  return { image_base64: imageBase64 }
}

async function removeWithRetry(imageBase64: string, retries = MAX_RETRIES): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await removeBackground(imageBase64)
    } catch (error) {
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 60000
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

    // Upload the bg-removed image, replacing the original
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

    // Update the original project_images record with the bg-removed URL
    await supabase
      .from('project_images')
      .update({ storage_url: publicUrlData.publicUrl, metadata: { bg_removed: true } })
      .eq('id', imageId)

    await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', jobId)

    return { success: true, cleaned_url: publicUrlData.publicUrl }
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
