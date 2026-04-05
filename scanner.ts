import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ── Clients ────────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

// ── Step 1: Analyze screenshot with GPT-4o ─────────────────────────────────

export async function extractWarrantyFromScreenshot(
  imageInput: string | Buffer
): Promise<ExtractedWarranty> {
  // Accept a file path (string) or raw image buffer
  let base64Image: string;
  let mimeType = "image/png";

  if (typeof imageInput === "string") {
    const ext = path.extname(imageInput).toLowerCase();
    mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const buffer = fs.readFileSync(imageInput);
    base64Image = buffer.toString("base64");
  } else {
    base64Image = imageInput.toString("base64");
  }

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

// ── Step 2: Save extracted data to Supabase ────────────────────────────────

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

// ── Step 3: Combined scanner pipeline ─────────────────────────────────────

/**
 * Full pipeline: analyze an Amazon order screenshot → extract fields → save to Supabase.
 *
 * @param imageInput  File path (string) or raw image Buffer of the screenshot.
 * @param userId      Authenticated Supabase user ID to associate the record with.
 * @param imageUrl    Optional public URL of the stored screenshot image.
 */
export async function scanAndSaveWarranty(
  imageInput: string | Buffer,
  userId: string,
  imageUrl?: string
): Promise<ScanResult> {
  try {
    console.log("🔍 Analyzing screenshot with GPT-4o...");
    const extracted = await extractWarrantyFromScreenshot(imageInput);
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

// ── CLI usage (optional) ───────────────────────────────────────────────────
// ts-node scanner.ts <image-path> <user-id>

if (require.main === module) {
  const [, , imagePath, userId] = process.argv;

  if (!imagePath || !userId) {
    console.error("Usage: ts-node scanner.ts <image-path> <user-id>");
    process.exit(1);
  }

  scanAndSaveWarranty(imagePath, userId).then((result) => {
    if (!result.success) process.exit(1);
  });
}
