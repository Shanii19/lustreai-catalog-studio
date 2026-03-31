const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

// Using Nano Banana (google/gemini-2.5-flash-image) for image generation
const MODEL = 'google/gemini-2.5-flash-image'

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

const BASE_PROMPT =
  'A beautiful Asian female model wearing elegant jewelry, professional studio lighting, clean white background, high fashion photography, photorealistic, 8k'

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

async function generateModelImage(
  enhancedImageBase64: string,
  promptSuffix: string
): Promise<{ image_base64: string }> {
  const fullPrompt = `${BASE_PROMPT}, ${promptSuffix}. The model should be wearing the exact jewelry shown in the reference image. Generate a photorealistic fashion photograph.`

  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: fullPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${enhancedImageBase64}`,
              },
            },
          ],
        },
      ],
    }),
  })

  if (response.status === 429) {
    throw new Error('Rate limited — please try again later')
  }
  if (response.status === 402) {
    throw new Error('AI credits exhausted — please add funds')
  }
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`AI Gateway error ${response.status}: ${errText}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        const dataMatch = part.image_url.url.match(/^data:[^;]+;base64,(.+)$/)
        if (dataMatch) return { image_base64: dataMatch[1] }
      }
      if (part.inline_data?.data) {
        return { image_base64: part.inline_data.data }
      }
    }
  }

  throw new Error('AI model did not return an image')
}

async function generateWithRetry(
  imageBase64: string,
  promptSuffix: string,
  retries = MAX_RETRIES
): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateModelImage(imageBase64, promptSuffix)
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

    // Fetch the enhanced image once, reuse for all variants
    const enhancedImageBase64 = await fetchImageAsBase64(enhanced_image_url)
    const generatedUrls: string[] = []

    try {
      for (let i = 0; i < VARIANT_PROMPTS.length; i++) {
        const { variant, suffix } = VARIANT_PROMPTS[i]

        const progressPct = Math.round(((i * 2 + 1) / (VARIANT_PROMPTS.length * 2)) * 100)
        await supabase.from('processing_jobs').update({ progress: progressPct }).eq('id', job.id)

        const result = await generateWithRetry(enhancedImageBase64, suffix)

        const storagePath = `${user_id}/${project_id}/models/${image_id}/variant_${variant}.png`

        const binaryStr = atob(result.image_base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j)
        const uploadBlob = new Blob([bytes], { type: 'image/png' })

        const { error: storageError } = await supabase.storage
          .from('project-images')
          .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })

        if (storageError) {
          throw new Error(`Storage upload failed for variant ${variant}: ${storageError.message}`)
        }

        const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

        await supabase.from('project_images').insert({
          project_id,
          storage_url: publicUrlData.publicUrl,
          type: 'model',
          metadata: { variant, jewelry_image_id: image_id },
        })

        generatedUrls.push(publicUrlData.publicUrl)

        const uploadPct = Math.round(((i * 2 + 2) / (VARIANT_PROMPTS.length * 2)) * 100)
        await supabase.from('processing_jobs').update({ progress: uploadPct }).eq('id', job.id)

        // Add delay between API calls to avoid rate limiting
        if (i < VARIANT_PROMPTS.length - 1) {
          await sleep(1000)
        }
      }

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
