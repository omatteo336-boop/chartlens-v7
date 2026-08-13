export async function onRequestPost(context) {
  try {
  const request = context.request;
  const requestBody = await request.clone().json().catch(()=>({}));
  const pairAsset = requestBody.pairAsset || "XAU/USD";
  const timeframe = requestBody.timeframe || "1 Minute";
  const focus = Array.isArray(requestBody.focus) ? requestBody.focus : [];
  const token = context.env?.HF_TOKEN;
  if (!token) return json({error:"HF_TOKEN is not configured in Cloudflare Pages environment variables."},500);

  let body;
  try { body = await request.json(); }
  catch { return json({error:"Invalid request JSON."},400); }
  if (!body.image || !String(body.image).startsWith("data:image/")) {
    return json({error:"A valid chart image is required."},400);
  }

  const focus = Array.isArray(body.focus) && body.focus.length ? body.focus.join(", ") : "all visible chart features";
  const system = `You are ChartLens V7, a careful professional chart-image analysis assistant.
Analyze ONLY what is visibly supported by the supplied chart image. Never invent prices, indicators, patterns, levels, volume, liquidity or market structure that cannot be read.
If something is cropped, unreadable, absent or ambiguous, say "Not available from the image" or explain the uncertainty.
Do not promise profits or give certainty about future price movement.
Return ONLY one valid JSON object. No markdown fences, no commentary before or after JSON.

Use exactly these JSON keys:
confidence, confidence_score, overall_assessment, asset, timeframe, bias, image_quality, market_structure, trend, support_resistance, liquidity, supply_demand, bos_choch, candlesticks, chart_patterns, moving_averages, momentum_volatility, volume, key_levels, scenario, invalidation.

confidence must be exactly one of: high, medium, low.
confidence_score must be an integer from 0 to 100 and reflect image quality plus strength of visible evidence, not probability of profit.
bias should be one of: bullish, bearish, neutral/unclear.
Keep each analysis field concise but useful.`;
  const user = `Analyze this ${body.asset || "chart"} on the ${body.timeframe || "selected"} timeframe.
Requested focus: ${focus}.
Use visual evidence only. Identify common chart patterns when genuinely visible (for example: double top/bottom, head and shoulders, triangles, flags, wedges, channels, rectangles, cup and handle), but do not force a pattern.
For market structure, distinguish observed swing highs/lows and BOS/CHoCH only when visible.
For key levels, report approximate values only when readable and label them approximate.
For scenario, describe conditional confirmation rather than a guaranteed trade direction.`;

  let upstream;
  try {
    upstream = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method:"POST",
      headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"google/gemma-4-31B-it:cerebras", temperature:0.1, max_tokens:1800,
        messages:[{role:"system",content:system},{role:"user",content:[{type:"text",text:user},{type:"image_url",image_url:{url:body.image}}]}]
      })
    });
  } catch (e) { return json({error:`Could not reach Hugging Face: ${e?.message || "network error"}`},502); }

  const raw = await upstream.text();
  if (!upstream.ok) {
    let detail = raw.slice(0,1200);
    try { const parsed=JSON.parse(raw); detail=parsed?.error?.message || parsed?.error || detail; } catch {}
    return json({error:`Hugging Face request failed (${upstream.status}). ${String(detail)}`},502);
  }
  let api; try { api=JSON.parse(raw); } catch { return json({error:"The model provider returned a non-JSON response."},502); }
  const rawContent=api?.choices?.[0]?.message?.content;
  const content=Array.isArray(rawContent)?rawContent.map(p=>typeof p==='string'?p:(p?.text||'')).join('\n'):rawContent;
  if (!content) return json({error:"The model returned no analysis content."},502);
  const cleaned=String(content).trim().replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/\s*```$/," ").trim();
  let result; try { result=JSON.parse(cleaned); } catch { return json({error:"The model response was not valid JSON."},502); }
  const required=["confidence","confidence_score","overall_assessment","asset","timeframe","bias","image_quality","market_structure","trend","support_resistance","liquidity","supply_demand","bos_choch","candlesticks","chart_patterns","moving_averages","momentum_volatility","volume","key_levels","scenario","invalidation"];
  for(const k of required) if(!(k in result)) result[k]="Not available from the image.";
  if(!["high","medium","low"].includes(result.confidence)) result.confidence="medium";
  result.confidence_score=Math.max(0,Math.min(100,Number(result.confidence_score)||0));
  return json(result,200);
}

  } catch (e) {
    return json({error:`ChartLens function error: ${e?.message || "unexpected server error"}`},500);
  }
}

export async function onRequest(context) {
  return json({error:"Method not allowed"},405);
}
function json(data,status){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}})}
