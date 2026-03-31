const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GEMINI_MODEL = 'gemini-2.0-flash-exp'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

// Using Gemini 2.0 Flash for zoom shot generation


interface RequestBody {
  model_image_url: string
  jewelry_image_url: string
  project_id: string
  image_id: string
  user_id: string
}

const ZOOM_SHOTS = [
  {
    angle: 'front',
    label: 'Front View',
    prompt: 'Ultra high resolution macro photo of the jewelry from the front, 4K, extreme detail, studio lighting, sharp focus on texture and gemstones, clean white background, professional product photography',
  },
  {
    angle: 'side',
    label: 'Side Profile',
    prompt: 'Ultra high resolution macro photo of the jewelry from side profile angle, 4K, extreme detail, studio lighting, sharp focus on texture and gemstones, clean white background, professional product photography',
  },
  {
    angle: 'top',
    label: 'Top-Down',
    prompt: 'Ultra high resolution macro photo of the jewelry from top-down flat lay angle, 4K, extreme detail, white marble surface, studio lighting, sharp focus on craftsmanship details, professional product photography',
  },
  {
    angle: 'macro',
    label: 'Macro Detail',
    prompt: 'Extreme macro close-up of the jewelry craftsmanship detail, 4K, bokeh background, jeweler\'s loupe perspective, ultra sharp focus on gemstone facets and metalwork, professional product photography',
  },
]

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

async function generateZoomImage(
  jewelryImageBase64: string,
  prompt: string
): Promise<{ image_base64: string }> {
  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${prompt}. Use the provided jewelry image as the exact reference — reproduce every detail of this specific piece of jewelry faithfully. Generate a photorealistic 4K product photograph.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${jewelryImageBase64}`,
              },
            },
          ],
        },
      ],
    }),
  })

  if (response.status === 429) throw new Error('Rate limited — please try again later')
  if (response.status === 402) throw new Error('AI credits exhausted — please add funds')
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

  // Check images array format
  const images = result.choices?.[0]?.message?.images
  if (Array.isArray(images) && images.length > 0) {
    const imgUrl = images[0]?.image_url?.url
    if (imgUrl) {
      const dataMatch = imgUrl.match(/^data:[^;]+;base64,(.+)$/)
      if (dataMatch) return { image_base64: dataMatch[1] }
    }
  }

  throw new Error('AI model did not return an image')
}

async function generateWithRetry(
  imageBase64: string,
  prompt: string,
  retries = MAX_RETRIES
): Promise<{ image_base64: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateZoomImage(imageBase64, prompt)
    } catch (error) {
      if (attempt < retries) {
        console.log(`Zoom gen attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`)
        await sleep(RETRY_DELAY_MS)
      } else {
        throw error
      }
    }
  }
  throw new Error('Zoom generation failed after all retries')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { jewelry_image_url, project_id, image_id, user_id } = (await req.json()) as RequestBody

    if (!jewelry_image_url || !project_id || !image_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: jewelry_image_url, project_id, image_id, user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        project_id,
        image_id,
        job_type: 'zoom',
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

    // Fetch the jewelry image once, reuse for all shots
    const jewelryBase64 = await fetchImageAsBase64(jewelry_image_url)
    const generatedUrls: string[] = []

    try {
      for (let i = 0; i < ZOOM_SHOTS.length; i++) {
        const { angle, prompt } = ZOOM_SHOTS[i]

        const progressPct = Math.round(((i * 2 + 1) / (ZOOM_SHOTS.length * 2)) * 100)
        await supabase.from('processing_jobs').update({ progress: progressPct }).eq('id', job.id)

        const result = await generateWithRetry(jewelryBase64, prompt)

        const storagePath = `${user_id}/${project_id}/zoom/${image_id}/${angle}.png`

        const binaryStr = atob(result.image_base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let j = 0; j < binaryStr.length; j++) bytes[j] = binaryStr.charCodeAt(j)
        const uploadBlob = new Blob([bytes], { type: 'image/png' })

        const { error: storageError } = await supabase.storage
          .from('project-images')
          .upload(storagePath, uploadBlob, { upsert: true, contentType: 'image/png' })

        if (storageError) {
          throw new Error(`Storage upload failed for ${angle}: ${storageError.message}`)
        }

        const { data: publicUrlData } = supabase.storage.from('project-images').getPublicUrl(storagePath)

        await supabase.from('project_images').insert({
          project_id,
          storage_url: publicUrlData.publicUrl,
          type: 'zoom',
          metadata: { angle, resolution: '4K', jewelry_image_id: image_id },
        })

        generatedUrls.push(publicUrlData.publicUrl)

        const uploadPct = Math.round(((i * 2 + 2) / (ZOOM_SHOTS.length * 2)) * 100)
        await supabase.from('processing_jobs').update({ progress: uploadPct }).eq('id', job.id)

        // Delay between API calls to avoid rate limiting
        if (i < ZOOM_SHOTS.length - 1) {
          await sleep(1000)
        }
      }

      await supabase.from('processing_jobs').update({ status: 'complete', progress: 100 }).eq('id', job.id)

      // Track usage
      await supabase.rpc('increment_usage', { p_user_id: user_id, p_field: 'zoom_shots_generated' })

      return new Response(
        JSON.stringify({ success: true, zoom_urls: generatedUrls }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (genError) {
      await supabase.from('processing_jobs').update({
        status: 'failed',
        error_message: genError instanceof Error ? genError.message : 'Unknown error',
      }).eq('id', job.id)

      return new Response(
        JSON.stringify({ error: 'Zoom generation failed', details: genError instanceof Error ? genError.message : 'Unknown error' }),
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
