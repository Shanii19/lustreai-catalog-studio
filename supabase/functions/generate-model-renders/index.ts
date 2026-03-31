const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TODO: Replace with your real model generation API URL
const MODEL_GEN_API_URL = Deno.env.get('MODEL_GEN_API_URL') || 'https://api.nanobananapi.com/generate'
// TODO: Replace with your real model generation API key
const MODEL_GEN_API_KEY = Deno.env.get('MODEL_GEN_API_KEY') || ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

interface RequestBody {
  enhanced_image_url: string
  project_id: string
  image_id: string
  user_id: string
}

const VARIANT_PROMPTS = [
  {
    variant: 1,
    suffix: 'close-up portrait, face and neckline visible, soft bokeh background',
  },
  {
    variant: 2,
    suffix: 'half-body shot, elegant pose, hands visible showcasing the jewelry',
  },
  {
    variant: 3,
    suffix: 'full editorial fashion shot, full body, runway style, dramatic lighting',
  },
]

// TODO: Adjust this base prompt for your specific jewelry type detection or user input
const BASE_PROMPT =
  'A beautiful Asian female model wearing elegant jewelry, professional studio lighting, clean white background, high fashion photography, photorealistic, 8k'

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callModelGenAPI(
  enhancedImageUrl: string,
  promptSuffix: string
): Promise<{ image_url?: string; image_base64?: string }> {
  const fullPrompt = `${BASE_PROMPT}, ${promptSuffix}`

  // TODO: Adapt this request body to match your real model generation API spec
  // This assumes an img2img / ControlNet style API that accepts a reference image
  const response = await fetch(MODEL_GEN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MODEL_GEN_API_KEY}`,
      // TODO: Add any additional headers required by your provider
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      reference_image_url: enhancedImageUrl,
      // TODO: If provider uses ControlNet, specify control mode:
      // control_type: 'reference',
      // strength: 0.7,
      num_images: 1,
      width: 768,
      height: 1024,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Model gen API error ${response.status}: ${errorText}`)
  }

  const result = await response.json()
  // TODO: Adapt response parsing to match your provider's response format
  return result
}

async function generateWithRetry(
  enhancedImageUrl: string,
  promptSuffix: string,
  retries = MAX_RETRIES
): Promise<{ image_url?: string; image_base64?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callModelGenAPI(enhancedImageUrl, promptSuffix)
    } catch (error) {
      if (attempt < retries) {
        console.log(`Model gen attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`)
        await sleep(RETRY_DELAY_MS)
      } else {
        throw error
      }
    }
  }
  throw new Error('Model generation failed after all retries')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { enhanced_image_url, project_id, image_id, user_id } = (await req.json()) as RequestBody

    if (!enhanced_image_url || !project_id || !image_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: enhanced_image_url, project_id, image_id, user_id' }),
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
        job_type: 'model_render',
        status: 'processing',
        progress: 5,
      })
      .select()
      .single()

    if (jobError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create processing job', details: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const generatedUrls: string[] = []

    try {
      for (let i = 0; i < VARIANT_PROMPTS.length; i++) {
        const { variant, suffix } = VARIANT_PROMPTS[i]

        // Update progress per variant
        const progressPct = Math.round(((i * 2 + 1) / (VARIANT_PROMPTS.length * 2)) * 100)
        await supabase.from('processing_jobs').update({ progress: progressPct }).eq('id', job.id)

        const result = await generateWithRetry(enhanced_image_url, suffix)

        // Upload to storage
        const storagePath = `${user_id}/${project_id}/models/${image_id}/variant_${variant}.png`

        let uploadBlob: Blob
        if (result.image_base64) {
          const binaryStr = atob(result.image_base64)
          const bytes = new Uint8Array(binaryStr.length)
          for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j)
          uploadBlob = new Blob([bytes], { type: 'image/png' })
        } else if (result.image_url) {
          const imgResp = await fetch(result.image_url)
          uploadBlob = await imgResp.blob()
        } else {
          throw new Error(`Variant ${variant}: API returned no image data`)
        }

        const { error: storageError } = await supabase.storage
          .from('project-images')
          .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })

        if (storageError) {
          throw new Error(`Storage upload failed for variant ${variant}: ${storageError.message}`)
        }

        const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

        // Insert model image record
        await supabase.from('project_images').insert({
          project_id,
          storage_url: publicUrlData.publicUrl,
          type: 'model',
          metadata: { variant, jewelry_image_id: image_id },
        })

        generatedUrls.push(publicUrlData.publicUrl)

        // Update progress after upload
        const uploadPct = Math.round(((i * 2 + 2) / (VARIANT_PROMPTS.length * 2)) * 100)
        await supabase.from('processing_jobs').update({ progress: uploadPct }).eq('id', job.id)
      }

      // Mark complete
      await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', job.id)

      return new Response(
        JSON.stringify({ success: true, model_urls: generatedUrls }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (genError) {
      await supabase.from('processing_jobs').update({
        status: 'failed',
        error_message: genError instanceof Error ? genError.message : 'Unknown error',
      }).eq('id', job.id)

      return new Response(
        JSON.stringify({ error: 'Model generation failed', details: genError instanceof Error ? genError.message : 'Unknown error' }),
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
