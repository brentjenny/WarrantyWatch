import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

// ── Clients ────────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // required for client-side usage in Capacitor
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExtractedWarranty {
  product_name: string;
  brand: string | null;
  order_id: string | null;
  purchase_date: string | null; // ISO 8601 date string: YYYY-MM-DD
}

export interface ScanResult {
  success: boolean;
  data?: ExtractedWarranty;
  error?: string;
}

// ── Step 1: Capture photo via Capacitor Camera API ─────────────────────────

/**
 * Opens the device camera or photo library and returns the image as a
 * base64-encoded string (without the data-URI prefix).
 *
 * @param source  CameraSource.Camera  — live camera shutter
 *                CameraSource.Photos  — pick from gallery (default)
 */
export async function captureWarrantyImage(
  source: CameraSource = CameraSource.Photos
): Promise<{ base64: string; mimeType: "image/jpeg" | "image/png" }> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source,
    quality: 90,
    // Ask for JPEG to keep payload size reasonable for GPT-4o
    saveToGallery: false,
  });

  if (!photo.base64String) {
    throw new Error("Camera returned no image data.");
  }

  const mimeType =
    photo.format === "png" ? "image/png" : "image/jpeg";

  return { base64: photo.base64String, mimeType };
}

// ── Step 2: Analyze image with GPT-4o ─────────────────────────────────────

export async function extractWarrantyFromBase64(
  base64Image: string,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<ExtractedWarranty> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a data extraction assistant. Analyze this Amazon order details screenshot and extract the following fields.

Return ONLY a valid JSON object with exactly these keys:
- "product_name": The full name of the product (string, required)
- "brand": The brand or manufacturer name if visible (string or null)
- "order_id": The Amazon order ID, usually formatted like 123-4567890-1234567 (string or null)
- "purchase_date": The order/purchase date in YYYY-MM-DD format (string or null)

If a field is not visible or cannot be determined, use null.
Do not include any explanation — return only the JSON object.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 300,
    temperature: 0,
  });

  const raw = response.choices[0]?.message?.content ?? "";

  // Strip markdown code fences if GPT wraps the JSON
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  const parsed = JSON.parse(cleaned) as ExtractedWarranty;

  if (!parsed.product_name) {
    throw new Error("GPT-4o could not extract a product name from the image.");
  }

  return parsed;
}

// ── Step 3: Save extracted data to Supabase ────────────────────────────────

export async function saveWarrantyToSupabase(
  userId: string,
  warranty: ExtractedWarranty,
  imageUrl?: string
): Promise<void> {
  const { error } = await supabase.from("warranties").insert({
    user_id: userId,
    product_name: warranty.product_name,
    brand: warranty.brand ?? null,
    order_id: warranty.order_id ?? null,
    purchase_date: warranty.purchase_date ?? null,
    image_url: imageUrl ?? null,
  });

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
}

// ── Step 4: Combined scanner pipeline ─────────────────────────────────────

/**
 * Full pipeline: open the Capacitor camera/gallery → extract fields via
 * GPT-4o → save to Supabase.
 *
 * @param userId   Authenticated Supabase user ID to associate the record with.
 * @param source   CameraSource.Camera | CameraSource.Photos (default: Photos)
 * @param imageUrl Optional public URL of the stored screenshot image.
 */
export async function scanAndSaveWarranty(
  userId: string,
  source: CameraSource = CameraSource.Photos,
  imageUrl?: string
): Promise<ScanResult> {
  try {
    console.log("📷 Opening camera / photo picker...");
    const { base64, mimeType } = await captureWarrantyImage(source);

    console.log("🔍 Analyzing screenshot with GPT-4o...");
    const extracted = await extractWarrantyFromBase64(base64, mimeType);
    console.log("✅ Extracted:", extracted);

    console.log("💾 Saving to Supabase...");
    await saveWarrantyToSupabase(userId, extracted, imageUrl);
    console.log("✅ Saved successfully.");

    return { success: true, data: extracted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Scanner error:", message);
    return { success: false, error: message };
  }
}
