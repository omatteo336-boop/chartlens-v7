export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();

    const instrument = String(
      formData.get("instrument") || "Not specified"
    ).trim();

    const analysisFocus = String(
      formData.get("analysisFocus") || "General chart analysis"
    ).trim();

    const charts = formData.getAll("charts");

    // ---------------------------------------------
    // VALIDATE NUMBER OF CHARTS
    // ---------------------------------------------

    if (charts.length === 0) {
      return json(
        {
          error: "Please upload at least one chart image."
        },
        400
      );
    }

    if (charts.length > 5) {
      return json(
        {
          error: "A maximum of 5 chart images is allowed."
        },
        400
      );
    }

    // ---------------------------------------------
    // VALIDATE AND COLLECT CHART INFORMATION
    // ---------------------------------------------

    const chartInformation = [];

    for (let index = 0; index < charts.length; index++) {
      const chart = charts[index];

      if (!(chart instanceof File)) {
        return json(
          {
            error:
              `Chart ${index + 1} is not a valid image file.`
          },
          400
        );
      }

      if (!chart.type.startsWith("image/")) {
        return json(
          {
            error:
              `Chart ${index + 1} must be an image.`
          },
          400
        );
      }

      if (chart.size > 10 * 1024 * 1024) {
        return json(
          {
            error:
              `Chart ${index + 1} is larger than 10 MB.`
          },
          400
        );
      }

      const timeframe = String(
        formData.get(`timeframe_${index}`) || "Unknown"
      ).trim();

      chartInformation.push({
        number: index + 1,
        filename: chart.name,
        timeframe,
        mime_type: chart.type,
        size_bytes: chart.size
      });
    }

    // ---------------------------------------------
    // CHARTLENS FRAMEWORK
    // ---------------------------------------------

    const framework = [
      {
        step: 1,
        title: "Higher-Timeframe Context",
        sections: [
          "Available context",
          "Higher-timeframe structure",
          "Missing context warnings"
        ]
      },
      {
        step: 2,
        title: "Market Structure",
        sections: [
          "Trend",
          "Swing structure",
          "BOS / CHoCH",
          "Structural evidence"
        ]
      },
      {
        step: 3,
        title: "Price Location",
        sections: [
          "Support",
          "Resistance",
          "Supply / demand",
          "Liquidity areas"
        ]
      },
      {
        step: 4,
        title: "Pattern Analysis",
        sections: [
          "Detected patterns",
          "Supporting evidence",
          "Contradicting evidence"
        ]
      },
      {
        step: 5,
        title: "Momentum & Behaviour",
        sections: [
          "Momentum",
          "Volatility",
          "Candlestick behaviour",
          "Volume if visible"
        ]
      },
      {
        step: 6,
        title: "Key Levels",
        sections: [
          "Important levels",
          "Structural reasons",
          "Level strength"
        ]
      },
      {
        step: 7,
        title: "Final Read",
        sections: [
          "Overall interpretation",
          "Confidence",
          "Supporting evidence",
          "Contradicting evidence",
          "What would change the read"
        ]
      }
    ];

    // ---------------------------------------------
    // AI PROVIDER STATUS
    // ---------------------------------------------

    const aiConnected = Boolean(
      context.env && context.env.HF_TOKEN
    );

    // ---------------------------------------------
    // RESPONSE
    // ---------------------------------------------

    return json(
      {
        status: "received",

        ai_connected: aiConnected,

        instrument,

        analysis_focus: analysisFocus,

        chart_count: charts.length,

        charts: chartInformation,

        framework,

        chart_quality: {
          status: "pending_ai_analysis",
          readable: "Not available from the image.",
          price_visible: "Not available from the image.",
          timeframe_visible: "Not available from the image.",
          instrument_visible: "Not available from the image.",
          additional_context:
            "Will be evaluated during AI analysis."
        },

        analysis: {
          confidence: "low",
          confidence_score: 0,

          overall_assessment:
            "AI analysis has not been run yet.",

          asset: instrument,

          timeframe: chartInformation
            .map((chart) => chart.timeframe)
            .join(", "),

          bias: "neutral/unclear",

          image_quality:
            "Pending visual analysis.",

          market_structure:
            "Pending visual analysis.",

          trend:
            "Pending visual analysis.",

          support_resistance:
            "Pending visual analysis.",

          liquidity:
            "Pending visual analysis.",

          supply_demand:
            "Pending visual analysis.",

          bos_choch:
            "Pending visual analysis.",

          candlesticks:
            "Pending visual analysis.",

          chart_patterns:
            "Pending visual analysis.",

          moving_averages:
            "Pending visual analysis.",

          momentum_volatility:
            "Pending visual analysis.",

          volume:
            "Pending visual analysis.",

          key_levels:
            "Pending visual analysis.",

          scenario:
            "Pending visual analysis.",

          invalidation:
            "Pending visual analysis."
        },

        education: {
          simple_explanation:
            "Upload your chart images and ChartLens will explain the visible market structure and evidence step by step.",

          concepts_detected: [],

          why_it_matters:
            "The educational analysis separates visible observations from assumptions and predictions."
        },

        warnings: [
          "ChartLens only analyzes information visible in the supplied images.",
          "Missing or unreadable information will be reported as unavailable.",
          "The analysis is educational and does not guarantee market outcomes."
        ],

        message: aiConnected
          ? "Charts received. AI provider detected."
          : "Charts received successfully. AI provider is not connected yet."
      },
      200
    );

  } catch (error) {
    return json(
      {
        error: "Unable to process the chart request.",

        details:
          error instanceof Error
            ? error.message
            : "Unknown server error"
      },
      500
    );
  }
}

// ---------------------------------------------
// OTHER REQUEST METHODS
// ---------------------------------------------

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  return json(
    {
      error: "Method not allowed. Use POST."
    },
    405
  );
}

// ---------------------------------------------
// JSON RESPONSE
// ---------------------------------------------

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    }
  );
}

// ---------------------------------------------
// CORS
// ---------------------------------------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type"
  };
          }
