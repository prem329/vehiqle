"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/prisma";
// Arcjet removed
// import aj from "@/lib/arcjet";
// import { request } from "@arcjet/next";

// Function to serialize car data
function serializeCarData(car) {
  return {
    ...car,
    price: car.price ? parseFloat(car.price.toString()) : 0,
    createdAt: car.createdAt?.toISOString(),
    updatedAt: car.updatedAt?.toISOString(),
  };
}

/**
 * Get featured cars for the homepage
 */
export async function getFeaturedCars(limit = 3) {
  try {
    const cars = await db.car.findMany({
      where: {
        featured: true,
        status: "AVAILABLE",
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return cars.map(serializeCarData);
  } catch (error) {
    throw new Error("Error fetching featured cars:" + error.message);
  }
}

// Function to convert File to base64
async function fileToBase64(file) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return buffer.toString("base64");
}

/**
 * Process car image with Gemini AI
 *
 * Note: Arcjet protection removed. If you need rate-limiting or bot protection,
 * implement it in an API route or middleware (not here) to avoid bundling heavy libs
 * into your edge/server code.
 */
export async function processImageSearch(file) {
  /**
   * Robust server-side handler for image -> Gemini processing.
   * - Accepts File/Blob (with .arrayBuffer), Buffer, or dataURL (string).
   * - Validates size/type, converts to base64 safely.
   * - Returns structured { success: boolean, data?, error? } instead of throwing.
   *
   * This helps diagnose iPhone uploads (HEIC, huge images, dataURLs) and avoids
   * uncaught exceptions bubbling to the client as "unexpected error".
   */

  // helper: convert dataURL to base64 payload (strip prefix)
  const dataUrlToBase64 = (dataUrl) => {
    const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!match) return null;
    return { mimeType: match[1], base64: match[2] };
  };

  // helper: normalize various file types to a base64 string and metadata
  async function normalizeFileToBase64(input) {
    // Already a data URL string?
    if (typeof input === "string") {
      const parsed = dataUrlToBase64(input);
      if (!parsed) throw new Error("String provided is not a valid data URL");
      return { base64: parsed.base64, mimeType: parsed.mimeType, size: Math.ceil((parsed.base64.length * 3) / 4) };
    }

    // Buffer (Node)
    if (Buffer.isBuffer(input)) {
      return { base64: input.toString("base64"), mimeType: "application/octet-stream", size: input.length };
    }

    // File/Blob-like (has arrayBuffer)
    if (input && typeof input.arrayBuffer === "function") {
      const buffer = Buffer.from(await input.arrayBuffer());
      // Try to get mime type and size from input if available
      const mimeType = input.type || "application/octet-stream";
      const size = typeof input.size === "number" ? input.size : buffer.length;
      return { base64: buffer.toString("base64"), mimeType, size };
    }

    throw new Error("Unsupported file input type");
  }

  try {
    // Basic guard: ensure something was passed
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Log basic info for debugging (server logs)
    try {
      // best-effort metadata
      const info = {
        name: file?.name ?? null,
        type: file?.type ?? (typeof file === "string" ? "dataurl" : null),
        size: file?.size ?? (Buffer.isBuffer(file) ? file.length : null),
      };
      console.log("[processImageSearch] incoming file:", info);
    } catch (_) {
      console.log("[processImageSearch] incoming file: (unable to read metadata)");
    }

    // Normalize / convert to base64 & get mime/size
    let normalized;
    try {
      normalized = await normalizeFileToBase64(file);
    } catch (err) {
      console.error("[processImageSearch] normalizeFileToBase64 error:", err);
      return { success: false, error: "Failed to read/convert uploaded file: " + err.message };
    }

    const { base64: base64Image, mimeType, size } = normalized;

    // Validate size (protect serverless / model limits)
    const MAX_BYTES = 6 * 1024 * 1024; // 6 MB (adjust as needed)
    if (typeof size === "number" && size > MAX_BYTES) {
      return { success: false, error: `Image too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)} MB allowed.` };
    }

    // Validate mime type - only accept common web formats (we convert HEIC client-side)
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes((mimeType || "").toLowerCase())) {
      return {
        success: false,
        error:
          `Unsupported image type "${mimeType}". Please upload a JPEG/PNG/WebP image. ` +
          `If you're uploading from iPhone, make sure the client converts HEIC to JPEG before upload.`,
      };
    }

    // Check Gemini key
    if (!process.env.GEMINI_API_KEY) {
      console.error("[processImageSearch] missing GEMINI_API_KEY");
      return { success: false, error: "AI service not configured" };
    }

    // Initialize Gemini API
    let genAI;
    try {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    } catch (err) {
      console.error("[processImageSearch] GoogleGenerativeAI init failed:", err);
      return { success: false, error: "Failed to initialize AI client" };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build image part
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    };

    // Prompt (same as before)
    const prompt = `
      Analyze this car image and extract the following information for a search query:
      1. Make (manufacturer)
      2. Body type (SUV, Sedan, Hatchback, etc.)
      3. Color

      Format your response as a clean JSON object with these fields:
      {
        "make": "",
        "bodyType": "",
        "color": "",
        "confidence": 0.0
      }

      For confidence, provide a value between 0 and 1 representing how confident you are in your overall identification.
      Only respond with the JSON object, nothing else.
    `;

    // Call model
    let result;
    try {
      result = await model.generateContent([imagePart, prompt]);
    } catch (err) {
      console.error("[processImageSearch] model.generateContent error:", err);
      return { success: false, error: "AI model call failed: " + (err.message || "unknown") };
    }

    // Get response text
    let response;
    try {
      response = await result.response;
    } catch (err) {
      console.error("[processImageSearch] result.response error:", err);
      return { success: false, error: "Failed to read AI response" };
    }

    let text;
    try {
      text = response.text();
    } catch (err) {
      console.error("[processImageSearch] response.text() error:", err);
      return { success: false, error: "Failed to extract text from AI response" };
    }

    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    // Parse JSON
    try {
      const carDetails = JSON.parse(cleanedText);
      return { success: true, data: carDetails };
    } catch (parseError) {
      console.error("[processImageSearch] Failed to parse AI JSON:", parseError);
      console.log("[processImageSearch] Raw AI text:", text);
      return { success: false, error: "Failed to parse AI response as JSON" };
    }
  } catch (error) {
    // Catch-all: log full error and return structured failure
    console.error("[processImageSearch] unexpected error:", error);
    return { success: false, error: "Unexpected server error: " + (error?.message || "unknown") };
  }
}
