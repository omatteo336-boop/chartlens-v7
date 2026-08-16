export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return json({
        status: "online",
        service: "ChartLens API",
        version: "1.0.0"
      });
    }

    // Analysis endpoint
    if (request.method === "POST" && url.pathname === "/api/analyze") {
      return handleAnalyze(request);
    }

    return json(
      {
        error: "Route not found"
      },
      404
    );
  }
};

async function handleAnalyze(request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return json(
        {
          error: "Request must use multipart/form-data."
        },
        400
      );
    }

    const formData = await request.formData();

    const instrument =
      String(formData.get("instrument") || "").trim();

    const analysisFocus =
      String(formData.get("analysisFocus") || "").trim();

    const charts = formData.getAll("charts");

    // Maximum of 5 chart images
    if (charts.length === 0) {
      return json(
        {
          error: "Please upload at least one chart."
        },
        400
      );
    }

    if (charts.length > 5) {
      return json(
        {
          error: "A maximum of 5 charts can be analyzed at once."
        },
        400
      );
    }

    const chartData = [];

    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i];

      if (!(chart instanceof File)) {
        return json(
          {
            error: `Chart ${i + 1} is not a valid file.`
          },
          400
        );
      }

      // 10 MB maximum per image
      if (chart.size > 10 * 1024 * 1024) {
        return json(
          {
            error: `Chart ${i + 1} is larger than 10 MB.`
          },
          400
        );
      }

      if (!chart.type.startsWith("image/")) {
        return json(
          {
            error: `Chart ${i + 1} must be an image.`
          },
          400
        );
      }

      const timeframe =
        String(
          formData.get(`timeframe_${i}`) || "Unknown"
        ).trim();

      chartData.push({
        filename: chart.name,
        timeframe,
        type: chart.type,
        size: chart.size
      });
    }

    /*
      AI PROVIDER WILL BE CONNECTED HERE.

      We intentionally do not fake an AI response.
      The next step will connect this endpoint
      to the actual vision model.
    */

    return json({
      status: "received",
      instrument: instrument || "Not specified",
      analysisFocus: analysisFocus || "General chart analysis",
      charts: chartData,
      chartCount: chartData.length,
      message: "Charts received successfully."
    });

  } catch (error) {
    return json(
      {
        error: "Unable to process the analysis request.",
        details: error instanceof Error
          ? error.message
          : "Unknown error"
      },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    }
  );
      }
