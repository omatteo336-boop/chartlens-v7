export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();

    const instrument = String(
      formData.get("instrument") || ""
    ).trim();

    const analysisFocus = String(
      formData.get("analysisFocus") || ""
    ).trim();

    const charts = formData
      .getAll("charts")
      .filter((item) => item instanceof File);

    // --------------------------------------------------
    // BASIC VALIDATION
    // --------------------------------------------------

    if (charts.length === 0) {
      return json({
        error: "Please upload at least one chart image."
      }, 400);
    }

    if (charts.length > 5) {
      return json({
        error: "A maximum of 5 chart images can be analyzed at once."
      }, 400);
    }

    // --------------------------------------------------
    // READ AND VALIDATE ALL CHARTS
    // --------------------------------------------------

    const chartInformation = [];

    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i];

      if (!(chart instanceof File)) {
        return json({
          error: `Chart ${i + 1} is not a valid file.`
        }, 400);
      }

      if (!chart.type.startsWith("image/")) {
        return json({
          error: `Chart ${i + 1} must be an image.`
        }, 400);
      }

      if (chart.size > 10 * 1024 * 1024) {
        return json({
          error: `Chart ${i + 1} is larger than 10 MB.`
        }, 400);
      }

      const timeframe = String(
        formData.get(`timeframe_${i}`) || "Unknown"
      ).trim();

      chartInformation.push({
        index: i + 1,
        filename: chart.name,
        timeframe,
        mimeType: chart.type,
        size: chart.size
      });
    }

    // --------------------------------------------------
    // CHARTLENS EDUCATIONAL ANALYSIS FRAMEWORK
    // --------------------------------------------------

    const framework = [
      "Higher-Timeframe Context",
      "Market Structure",
      "Price Location",
      "Pattern Analysis",
      "Momentum & Behaviour",
      "Key Levels",
      "Final Read"
    ];

    /*
      IMPORTANT

      This endpoint is now intentionally structured so the frontend
      and Cloudflare deployment work correctly.

      The actual vision-model request can be connected through
      an environment secret later.

      Do not place an API key directly in this file.
    */

    const aiToken = context.env?.HF_TOKEN;

    // --------------------------------------------------
    // IF NO AI PROVIDER IS CONNECTED YET
    // --------------------------------------------------

    if (!aiToken) {
      return json({
        status: "received",
        ai_connected: false,

        instrument:
          instrument || "Not specified",

        analysis_focus:
          analysisFocus || "General chart analysis",

        charts: chartInformation,

        framework,

        message:
          "Your chart images were received successfully. " +
          "The AI vision provider is not connected yet.",

        next_step:
          "Connect an AI provider using the HF_TOKEN environment secret."
      }, 200);
    }

    // --------------------------------------------------
    // CONVERT IMAGES TO DATA URLS
    // --------------------------------------------------

    const imageInputs = [];

    for (const chart of charts) {
      const bytes = await chart.arrayBuffer();

      const base64 = arrayBufferToBase64(bytes);

      imageInputs.push({
        timeframe:
          chartInformation.find(
            (item) => item.filename === chart.name
          )?.timeframe || "Unknown",

        mimeType: chart.type,

        dataUrl:
          `data:${chart.type};base64,${base64}`
      });
    }

    // --------------------------------------------------
    // SYSTEM INSTRUCTIONS
    // --------------------------------------------------

    const systemPrompt = `
You are the ChartLens educational chart-analysis engine.

Analyze ONLY what is visibly supported by the supplied chart images.

The user may provide up to five images representing different
timeframes. Treat them as separate pieces of visual context.

Never invent:

- prices
- indicators
- patterns
- support
- resistance
- volume
- liquidity
- market structure
- timeframe information
- instrument information

If something is cropped, unreadable, absent, or ambiguous, write:

"Not available from the image."

Do not claim to know future market direction.

Do not promise profits.

Do not provide guaranteed predictions.

Do not issue personalized financial advice.

The purpose is educational chart interpretation.

When multiple timeframes are supplied, distinguish clearly
between observations from each timeframe.

Return ONLY one valid JSON object.

Do not use markdown.

Do not use code fences.

Use exactly these keys:

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

confidence must be exactly one of:

high
medium
low

confidence_score must be an integer from 0 to 100.

The confidence score represents the quality and strength
of the visible evidence.

It is NOT a probability of profit.

bias must be exactly one of:

bullish
bearish
neutral/unclear

For scenario and invalidation, describe educational,
conditional observations only.

Never present them as guaranteed trading instructions.
`;

    // --------------------------------------------------
    // USER INSTRUCTIONS
    // --------------------------------------------------

    const userPrompt = `
ChartLens analysis request.

Instrument:
${instrument || "Not specified"}

Requested analysis focus:
${analysisFocus || "General chart analysis"}

Number of supplied chart images:
${charts.length}

Timeframes supplied:

${chartInformation
  .map(
    (chart) =>
      `Chart ${chart.index}: ${chart.timeframe}`
  )
  .join("\n")}

Analyze the supplied images together while preserving
the timeframe of each image.

Follow the seven-part ChartLens framework:

1. Higher-Timeframe Context
2. Market Structure
3. Price Location
4. Pattern Analysis
5. Momentum & Behaviour
6. Key Levels
7. Final Read

Use visible evidence only.

For market structure:
- identify visible swing highs
- identify visible swing lows
- identify BOS only when genuinely visible
- identify CHoCH only when genuinely visible

For support and resistance:
Only report levels when the price scale is readable.

For liquidity:
Only identify visible liquidity-related areas
when the chart actually supports that interpretation.

For supply and demand:
Only identify visible zones supported by price action.

For patterns:
Only identify a pattern when the visual structure
actually supports it.

For moving averages:
Mention them only if visibly present.

For volume:
Mention it only if visibly present.

For momentum:
Use only visible price behaviour.

If information cannot be reliably determined,
say "Not available from the image."

Keep every field concise but informative.
`;

    // --------------------------------------------------
    // HUGGING FACE REQUEST
    // --------------------------------------------------

    let upstream;

    try {
      upstream = await fetch(
        "https://router.huggingface.co/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${aiToken}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model: "google/gemma-3-27b-it",

            temperature: 0.1,

            max_tokens: 2500,

            messages: [
              {
                role: "system",
                content: systemPrompt
              },

              {
                role: "user",

                content: [
                  {
                    type: "text",
                    text: userPrompt
                  },

                  ...imageInputs.map(
                    (image) => ({
                      type: "image_url",

                      image_url: {
                        url: image.dataUrl
                      }
                    })
                  )
                ]
              }
            ]
          })
        }
      );
    } catch (error) {
      return json({
        error:
          "Could not reach the AI provider.",

        details:
          error instanceof Error
            ? error.message
            : "Unknown network error"
      }, 502);
    }

    // --------------------------------------------------
    // READ AI RESPONSE
    // --------------------------------------------------

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
        // Keep original response.
      }

      return json({
        error:
          `AI provider request failed (${upstream.status}).`,

        details:
          String(detail)
      }, 502);
    }

    let apiResponse;

    try {
      apiResponse = JSON.parse(raw);

    } catch {
      return json({
        error:
          "The AI provider returned an invalid response."
      }, 502);
    }

    const rawContent =
      apiResponse?.choices?.[0]?.message?.content;

    const content =
      Array.isArray(rawContent)

        ? rawContent
            .map((part) =>
              typeof part === "string"
                ? part
                : part?.text || ""
            )
            .join("\n")

        : rawContent;

    if (!content) {
      return json({
        error:
          "The AI model returned no analysis."
      }, 502);
    }

    // --------------------------------------------------
    // CLEAN MODEL OUTPUT
    // --------------------------------------------------

    const cleaned =
      String(content)
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
        error:
          "The AI model returned invalid JSON.",

        raw_preview:
          cleaned.slice(0, 1000)
      }, 502);
    }

    // --------------------------------------------------
    // GUARANTEE REQUIRED FIELDS
    // --------------------------------------------------

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
        result[field] =
          "Not available from the image.";
      }
    }

    // --------------------------------------------------
    // NORMALIZE CONFIDENCE
    // --------------------------------------------------

    if (
      !["high", "medium", "low"]
        .includes(result.confidence)
    ) {
      result.confidence = "medium";
    }

    const score =
      Number(result.confidence_score);

    result.confidence_score =
      Number.isFinite(score)
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(score)
            )
          )
        : 0;

    // --------------------------------------------------
    // NORMALIZE BASIC INFORMATION
    // --------------------------------------------------

    if (!result.asset) {
      result.asset =
        instrument ||
        "Not specified";
    }

    if (!result.timeframe) {
      result.timeframe =
        chartInformation
          .map((chart) => chart.timeframe)
          .join(", ");
    }

    // --------------------------------------------------
    // RETURN FINAL ANALYSIS
    // --------------------------------------------------

    return json(
      {
        status: "complete",

        instrument:
          instrument ||
          result.asset ||
          "Not specified",

        requested_focus:
          analysisFocus ||
          "General chart analysis",

        charts:
          chartInformation,

        framework,

        analysis:
          result
      },
      200
    );

  } catch (error) {

    return json({
      error:
        "ChartLens could not process the request.",

      details:
        error instanceof Error
          ? error.message
          : "Unexpected server error"
    }, 500);
  }
}

// --------------------------------------------------
// METHOD HANDLER
// --------------------------------------------------

export async function onRequest(context) {

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  return json({
    error:
      "Method not allowed. Use POST."
  }, 405);
}

// --------------------------------------------------
// JSON RESPONSE
// --------------------------------------------------

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data, null, 2),

    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        ...corsHeaders()
      }
    }
  );
}

// --------------------------------------------------
// CORS
// --------------------------------------------------

function corsHeaders() {

  return {
    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type"
  };
}

// --------------------------------------------------
// ARRAY BUFFER → BASE64
// --------------------------------------------------

function arrayBufferToBase64(buffer) {

  const bytes =
    new Uint8Array(buffer);

  const chunkSize = 0x8000;

  let binary = "";

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    const chunk =
      bytes.subarray(
        i,
        Math.min(
          i + chunkSize,
          bytes.length
        )
      );

    binary += String.fromCharCode(
      ...chunk
    );
  }

  return btoa(binary);
    }        return response({
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
