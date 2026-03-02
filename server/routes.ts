import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface HaircutRecommendation {
  rank: number;
  name: string;
  description: string;
  whyItFits: string;
  difficulty: string;
  imagePrompt: string;
}

interface FaceAnalysis {
  faceShape: string;
  faceFeatures: string;
  hasGlasses: boolean;
  hairColor: string;
  skinTone: string;
  gender: string;
  recommendations: HaircutRecommendation[];
}

async function analyzeFaceAndGetHaircuts(imageBase64: string): Promise<FaceAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content: `You are a professional hair stylist and barber with 20+ years of experience. 
Analyze the face in the image carefully and recommend the 4 best haircuts.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "faceShape": "oval|round|square|heart|oblong|diamond",
  "faceFeatures": "1-2 sentence description of key facial features, bone structure, proportions",
  "hasGlasses": true or false,
  "hairColor": "describe natural hair color (e.g. dark brown, blonde, black, gray)",
  "skinTone": "describe skin tone (e.g. fair, medium, olive, dark brown)",
  "gender": "man|woman|person",
  "recommendations": [
    {
      "rank": 1,
      "name": "Haircut Name",
      "description": "Precise description of the cut: length, texture, styling, sides vs top",
      "whyItFits": "Why this specifically suits this face shape and features (1-2 sentences)",
      "difficulty": "Easy|Medium|Hard",
      "imagePrompt": "Ultra-detailed hairstyle description for image generation: exact lengths, fade levels, texture, part placement, styling — enough for a barber to replicate perfectly"
    }
  ]
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
          {
            type: "text",
            text: "Analyze my face thoroughly — face shape, features, glasses if present, skin tone, and hair color — then give me the 4 best haircuts with detailed image generation prompts.",
          },
        ],
      },
    ],
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Invalid AI response format");
  return JSON.parse(jsonMatch[0]);
}

async function generateHaircutImage(
  imageBase64: string,
  analysis: FaceAnalysis,
  rec: HaircutRecommendation
): Promise<string | null> {
  try {
    const imgBuffer = Buffer.from(imageBase64, "base64");
    const imgFile = await toFile(imgBuffer, "face.png", { type: "image/png" });

    const glassesNote = analysis.hasGlasses
      ? "The person wears glasses — keep the glasses exactly as they are, same frames, same style."
      : "The person does not wear glasses.";

    const prompt = `This is a photorealistic portrait of a ${analysis.gender} with ${analysis.skinTone} skin and ${analysis.hairColor} hair.

TASK: Apply ONLY the following hairstyle change. Do not change ANYTHING else about the person.

NEW HAIRSTYLE — ${rec.name}:
${rec.imagePrompt}

STRICT RULES:
- Keep the person's face IDENTICAL: same facial structure, same eyes, nose, mouth, eyebrows, skin tone, complexion, any facial hair
- ${glassesNote}
- Keep the background and clothing the same
- Only the hair on top of the head changes — style, length, texture, and cut
- The result must look like a natural, professional portrait photo — photorealistic, high quality
- Match the person's natural ${analysis.hairColor} hair color unless the haircut description requires a different color
- Do NOT add any text, watermarks, or overlays`;

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imgFile,
      prompt,
      size: "1024x1024",
    });

    return response.data[0]?.b64_json ?? null;
  } catch (err: any) {
    console.error(`Image generation failed for ${rec.name}:`, err?.message || err);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const imageBase64 = image.includes(",") ? image.split(",")[1] : image;

      console.log("Analyzing face...");
      const analysis = await analyzeFaceAndGetHaircuts(imageBase64);
      console.log(`Face shape: ${analysis.faceShape}, glasses: ${analysis.hasGlasses}, generating images...`);

      const imagePromises = analysis.recommendations.map((rec) =>
        generateHaircutImage(imageBase64, analysis, rec)
      );

      const generatedImages = await Promise.all(imagePromises);

      const results = analysis.recommendations.map((rec, i) => ({
        rank: rec.rank,
        name: rec.name,
        description: rec.description,
        whyItFits: rec.whyItFits,
        difficulty: rec.difficulty,
        generatedImage: generatedImages[i]
          ? `data:image/png;base64,${generatedImages[i]}`
          : null,
      }));

      console.log("Analysis and generation complete.");

      res.json({
        faceShape: analysis.faceShape,
        faceFeatures: analysis.faceFeatures,
        hasGlasses: analysis.hasGlasses,
        recommendations: results,
      });
    } catch (error: any) {
      console.error("Error analyzing face:", error);
      res.status(500).json({
        error: error.message || "Failed to analyze face. Please try again.",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
