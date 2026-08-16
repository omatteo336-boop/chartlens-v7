export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();

    const instrument =
      String(formData.get("instrument") || "").trim();

    const analysisFocus =
      String(formData.get("analysisFocus") || "").trim();

    const charts = formData.getAll("charts");

    if (charts.length === 0) {
      return response({
        error: "Please upload at least one chart."
      }, 400);
    }

    if (charts.length > 5) {
      return response({
        error: "A maximum of 5 charts can be analyzed at once."
      }, 400);
    }

    const chartInformation = [];

    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i];

      if (!(chart instanceof File)) {
        return response({
          error: `Chart ${i + 1} is not a valid image file.`
        }, 400);
      }

      if (chart.size > 10 * 1024 * 1024) {
        return response({
          error: `Chart ${i + 1} is larger than 10 MB.`
        }, 400);
      }

      if (!chart.type.startsWith("image/")) {
        return response({
          error: `Chart ${i + 1} must be an image.`
        }, 400);
      }

      const timeframe =
        String(
          formData.get(`timeframe_${i}`) || "Unknown"
        ).trim();

      chartInformation.push({
        filename: chart.name,
        timeframe,
        mimeType: chart.type,
        size: chart.size
      });
    }

    /*
      CHARTLENS AI ENGINE

      The vision model will be connected here.

      The model will eventually receive:
      - all uploaded chart images
      - timeframe for every image
      - instrument
      - selected analysis focus

      It will return the seven-part educational analysis.
    */

    const analysis = {
      status: "ready_for_ai",
      instrument: instrument || "Not specified",
      analysisFocus:
        analysisFocus || "General chart analysis",

      charts: chartInformation,

      framework: [
        "Higher-Timeframe Context",
        "Market Structure",
        "Price Location",
        "Pattern Analysis",
        "Momentum & Behaviour",
        "Key Levels",
        "Final Read"
      ],

      message:
        "Chart received successfully. AI analysis engine is ready to be connected."
    };

    return response(analysis, 200);

  } catch (error) {
    return response({
      error: "Unable to process the analysis request.",
      details:
        error instanceof Error
          ? error.message
          : "Unknown error"
    }, 500);
  }
}

function response(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}Analyze ONLY what is visibly supported by the supplied chart image.

Never invent:
- prices
- indicators
- patterns
- support or resistance
- volume
- liquidity
- market structure

If something is cropped, unreadable, absent, or ambiguous, say:
"Not available from the image."

Do not promise profits or certainty about future price movement.

Return ONLY one valid JSON object.
No markdown.
No code fences.
No commentary before or after the JSON.

Use exactly these JSON keys:

confidence,
confidence_score,
overall_assessment,
asset,
timeframe,
bias,
image_quality,
market_structure,
trend,
support_resistance,
liquidity,
supply_demand,
bos_choch,
candlesticks,
chart_patterns,
moving_averages,
momentum_volatility,
volume,
key_levels,
scenario,
invalidation

confidence must be exactly:
high
medium
low

confidence_score must be an integer from 0 to 100.

The confidence score represents the quality and strength of visible evidence.
It is NOT a probability of profit.

bias must be exactly one of:
bullish
bearish
neutral/unclear
`;

    const user = `
Analyze this ${pairAsset} chart on the ${timeframe} timeframe.

Requested analysis focus:
${focus}

Use visual evidence only.

For market structure:
- identify visible swing highs and swing lows
- identify BOS or CHoCH only when genuinely visible

For chart patterns:
Only identify a pattern when the visual structure actually supports it.
Possible examples include:
double top,
double bottom,
head and shoulders,
triangles,
flags,
wedges,
channels,
rectangles,
cup and handle.

For key levels:
Report approximate values only when the price scale is readable.

For supply and demand:
Only identify visible zones supported by price action.

For momentum and volatility:
Use only visible evidence.

For moving averages:
Mention them only if they are visibly present and readable.

For volume:
Mention it only if visible.

For scenario:
Describe conditional confirmation rather than a guaranteed trade direction.

Keep every field concise but useful.
`;

    let upstream;

    try {
      upstream = await fetch(
        "https://router.huggingface.co/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "google/gemma-4-31B-it:cerebras",
            temperature: 0.1,
            max_tokens: 1800,
            messages: [
              {
                role: "system",
                content: system
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: user
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: body.image
                    }
                  }
                ]
              }
            ]
          })
        }
      );
    } catch (error) {
      return json({
        error: `Could not reach Hugging Face: ${
          error?.message || "network error"
        }`
      }, 502);
    }

    const raw = await upstream.text();

    if (!upstream.ok) {
      let detail = raw.slice(0, 1200);

      try {
        const parsed = JSON.parse(raw);
        detail =
          parsed?.error?.message ||
          parsed?.error ||
          detail;
      } catch {
        // Keep the raw response.
      }

      return json({
        error: `Hugging Face request failed (${upstream.status}). ${String(detail)}`
      }, 502);
    }

    let apiResponse;

    try {
      apiResponse = JSON.parse(raw);
    } catch {
      return json({
        error: "Hugging Face returned a non-JSON response."
      }, 502);
    }

    const rawContent =
      apiResponse?.choices?.[0]?.message?.content;

    const content = Array.isArray(rawContent)
      ? rawContent
          .map(part =>
            typeof part === "string"
              ? part
              : part?.text || ""
          )
          .join("\n")
      : rawContent;

    if (!content) {
      return json({
        error: "The AI model returned no analysis content."
      }, 502);
    }

    const cleaned = String(content)
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch {
      return json({
        error: "The AI model returned invalid JSON.",
        raw_preview: cleaned.slice(0, 500)
      }, 502);
    }

    const requiredFields = [
      "confidence",
      "confidence_score",
      "overall_assessment",
      "asset",
      "timeframe",
      "bias",
      "image_quality",
      "market_structure",
      "trend",
      "support_resistance",
      "liquidity",
      "supply_demand",
      "bos_choch",
      "candlesticks",
      "chart_patterns",
      "moving_averages",
      "momentum_volatility",
      "volume",
      "key_levels",
      "scenario",
      "invalidation"
    ];

    for (const field of requiredFields) {
      if (!(field in result)) {
        result[field] = "Not available from the image.";
      }
    }

    if (!["high", "medium", "low"].includes(result.confidence)) {
      result.confidence = "medium";
    }

    const score = Number(result.confidence_score);

    result.confidence_score = Number.isFinite(score)
      ? Math.max(0, Math.min(100, Math.round(score)))
      : 0;

    result.asset = result.asset || pairAsset;
    result.timeframe = result.timeframe || timeframe;

    return json(result, 200);

  } catch (error) {
    return json({
      error: `ChartLens function error: ${
        error?.message || "unexpected server error"
      }`
    }, 500);
  }
}

export async function onRequest(context) {
  return json({
    error: "Method not allowed"
  }, 405);
}

function json(data, status) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
    }
