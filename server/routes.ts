import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

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
  ageRange: string;
  recommendations: HaircutRecommendation[];
}

async function analyzeFaceAndGetHaircuts(imageBase64: string): Promise<FaceAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content: `You are a professional hair stylist and barber with 20+ years of experience.
Analyze the face in the image and recommend the 4 best haircuts.

Return ONLY valid JSON (no markdown, no extra text):
{
  "faceShape": "oval|round|square|heart|oblong|diamond",
  "faceFeatures": "1-2 sentence description of facial structure and proportions",
  "hasGlasses": true or false,
  "hairColor": "natural hair color (e.g. dark brown, black, blonde, auburn, gray)",
  "skinTone": "skin tone description (e.g. fair, light, medium, olive, tan, dark brown, deep)",
  "gender": "man|woman|person",
  "ageRange": "approximate age range (e.g. 20s, 30s, teens)",
  "recommendations": [
    {
      "rank": 1,
      "name": "Haircut Name",
      "description": "Clear 1-sentence description of the cut",
      "whyItFits": "Why this suits this person's face (1-2 sentences)",
      "difficulty": "Easy|Medium|Hard",
      "imagePrompt": "Detailed hairstyle description for portrait generation: exact hair length, fade type and level, texture, styling, top vs sides treatment — enough detail for a professional image generator"
    }
  ]
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "text",
            text: "Analyze this face thoroughly and give me the 4 best haircut recommendations with detailed image generation prompts.",
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
  analysis: FaceAnalysis,
  rec: HaircutRecommendation
): Promise<string | null> {
  try {
    const glassesDetail = analysis.hasGlasses
      ? "wearing stylish glasses, "
      : "";

    const prompt = `Professional portrait photograph of a ${analysis.ageRange} ${analysis.gender} with ${analysis.skinTone} skin tone, ${glassesDetail}with the following hairstyle:

${rec.name}: ${rec.imagePrompt}

Style details: ${rec.description}

Photo style: Clean studio portrait, soft natural lighting, neutral background, photorealistic, high quality, sharp focus on the hair and face. The hairstyle should be clearly visible and styled well. Cinematic, modern look.`;

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
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
      console.log(
        `Face: ${analysis.faceShape}, ${analysis.gender}, glasses: ${analysis.hasGlasses} — generating haircut images...`
      );

      const imagePromises = analysis.recommendations.map((rec) =>
        generateHaircutImage(analysis, rec)
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

      const successCount = generatedImages.filter(Boolean).length;
      console.log(`Done. ${successCount}/4 images generated successfully.`);

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
