// Food name search, proxying USDA FoodData Central so the API key stays
// server-side. Auth-gated (verify_jwt) — only signed-in users can search.
// Returns generic foods (Foundation / SR Legacy / FNDDS) normalized to
// per-100g macros, the shape the Log form's barcode path already consumes.
// (Barcode lookups stay on OpenFoodFacts; FDC handles typed search.)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FdcNutrient { nutrientNumber?: string | number; value?: number; unitName?: string }
interface FdcFood { fdcId?: number; description?: string; foodNutrients?: FdcNutrient[] }

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Resolve a nutrient by trying nutrientNumbers in priority order. For energy we
// require KCAL (FDC also lists kJ and, for Foundation foods, Atwater variants).
function nutrientValue(food: FdcFood, numbers: string[], requireKcal = false): number | null {
  const list = food.foodNutrients || []
  for (const target of numbers) {
    for (const n of list) {
      if (String(n.nutrientNumber) === target) {
        if (requireKcal && (n.unitName || '').toUpperCase() !== 'KCAL') continue
        if (typeof n.value === 'number') return n.value
      }
    }
  }
  return null
}

const clamp = (v: number | null) => Math.max(0, Math.round(v ?? 0))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!req.headers.get('Authorization')) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const { q } = await req.json()
    const term = (q || '').toString().trim()
    if (term.length < 2) return jsonResponse({ foods: [] })

    const apiKey = Deno.env.get('USDA_FDC_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'Food search is not configured' }, 500)

    // POST with a JSON body: FDC's GET rejects URL-encoded commas in dataType
    // (URLSearchParams emits %2C and the API 400s), so we send dataType as an array.
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        query: term.slice(0, 80),
        dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'],
        pageSize: 25,
      }),
    })
    if (!res.ok) return jsonResponse({ error: 'Food database unavailable' }, 502)
    const data = await res.json()

    const foods = []
    for (const f of (data.foods || []) as FdcFood[]) {
      // Energy: kcal (208) for SR Legacy/FNDDS, Atwater (957/958) for Foundation.
      const calories = nutrientValue(f, ['208', '957', '958'], true)
      if (calories == null || !f.description) continue
      foods.push({
        fdcId: f.fdcId,
        name: f.description,
        calories: clamp(calories),
        protein: clamp(nutrientValue(f, ['203'])),
        carbs: clamp(nutrientValue(f, ['205'])),
        fat: clamp(nutrientValue(f, ['204'])),
      })
      if (foods.length >= 12) break
    }

    return jsonResponse({ foods })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('Food search error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
