const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TODO: Replace with your real enhancement API URL
const ENHANCEMENT_API_URL = Deno.env.get('ENHANCEMENT_API_URL') || 'https://api.enhancement-provider.com/enhance'
// TODO: Replace with your real enhancement API key
const ENHANCEMENT_API_KEY = Deno.env.get('ENHANCEMENT_API_KEY') || ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

interface RequestBody {
  image_url: string
  project_id: string
  image_id: string
  user_id: string
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callEnhancementAPI(imageUrl: string): Promise<{ enhanced_url?: string; enhanced_base64?: string }> {
  // TODO: Adapt this to match your real enhancement provider's API spec
  // Some providers accept a URL, others require base64-encoded image data
  const response = await fetch(ENHANCEMENT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENHANCEMENT_API_KEY}`,
      // TODO: Add any additional headers required by your provider
    },
    body: JSON.stringify({
      image_url: imageUrl,
      // TODO: If provider requires base64, fetch the image and encode it:
      // image_data: base64EncodedString,
      options: {
        // TODO: Configure enhancement options per provider spec
        quality: 'high',
        upscale: true,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Enhancement API error ${response.status}: ${errorText}`)
  }

  const result = await response.json()
  // TODO: Adapt response parsing to match your provider's response format
  return result
}

async function enhanceWithRetry(imageUrl: string, retries = MAX_RETRIES): Promise<{ enhanced_url?: string; enhanced_base64?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callEnhancementAPI(imageUrl)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image_url, project_id, image_id, user_id } = await req.json() as RequestBody

    if (!image_url || !project_id || !image_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: image_url, project_id, image_id, user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Create processing job
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        project_id,
        image_id,
        job_type: 'enhance',
        status: 'processing',
        progress: 10,
      })
      .select()
      .single()

    if (jobError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create processing job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update progress
    await supabase.from('processing_jobs').update({ progress: 30 }).eq('id', job.id)

    try {
      const result = await enhanceWithRetry(image_url)

      await supabase.from('processing_jobs').update({ progress: 70 }).eq('id', job.id)

      // Upload enhanced image to storage
      const filename = image_url.split('/').pop() || `enhanced_${Date.now()}.jpg`
      const storagePath = `${user_id}/${project_id}/enhanced/${filename}`

      let uploadBlob: Blob
      if (result.enhanced_base64) {
        // TODO: Adapt if provider returns base64
        const binaryStr = atob(result.enhanced_base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        uploadBlob = new Blob([bytes], { type: 'image/jpeg' })
      } else if (result.enhanced_url) {
        const imgResp = await fetch(result.enhanced_url)
        uploadBlob = await imgResp.blob()
      } else {
        throw new Error('Enhancement API returned no image data')
      }

      const { error: storageError } = await supabase.storage
        .from('project-images')
        .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/jpeg' })

      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`)
      }

      const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

      // Insert enhanced image record
      await supabase.from('project_images').insert({
        project_id,
        storage_url: publicUrlData.publicUrl,
        type: 'enhanced',
        metadata: { original_image_id: image_id },
      })

      // Mark job complete
      await supabase.from('processing_jobs').update({
        status: 'complete',
        progress: 100,
      }).eq('id', job.id)

      return new Response(
        JSON.stringify({ success: true, enhanced_url: publicUrlData.publicUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (enhanceError) {
      // Mark job as failed
      await supabase.from('processing_jobs').update({
        status: 'failed',
        error_message: enhanceError instanceof Error ? enhanceError.message : 'Unknown error',
      }).eq('id', job.id)

      return new Response(
        JSON.stringify({ error: 'Enhancement failed', details: enhanceError instanceof Error ? enhanceError.message : 'Unknown error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid request', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
