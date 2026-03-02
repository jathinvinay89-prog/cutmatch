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
}

async function analyzeFaceAndGetHaircuts(imageBase64: string): Promise<{
  faceShape: string;
  faceFeatures: string;
  recommendations: HaircutRecommendation[];
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content: `You are a professional hair stylist and barber with 20+ years of experience. 
Analyze the face in the image and recommend the 4 best haircuts based on face shape, bone structure, facial features, and proportions.
Return ONLY valid JSON with this exact structure:
{
  "faceShape": "oval/round/square/heart/oblong/diamond",
  "faceFeatures": "brief 1-2 sentence description of key facial features and proportions",
  "recommendations": [
    {
      "rank": 1,
      "name": "Haircut Name",
      "description": "What the haircut looks like in 1 sentence",
      "whyItFits": "Specific reason why this suits this person's face shape and features in 1-2 sentences",
      "difficulty": "Easy/Medium/Hard"
    }
  ]
}
Rank them from best (1) to 4th best. Be specific and helpful.`,
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
            text: "Analyze my face and recommend the 4 best haircuts for me.",
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
  haircutName: string,
  haircutDescription: string
): Promise<string | null> {
  try {
    const imgBuffer = Buffer.from(imageBase64, "base64");
    const imgFile = await toFile(imgBuffer, "face.png", { type: "image/png" });

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imgFile,
      prompt: `Change this person's hairstyle to: ${haircutName}. ${haircutDescription}. Keep the person's face, skin tone, facial features, and expression exactly the same. Only modify the hair style, length, and cut. Make it look photorealistic and natural.`,
      size: "1024x1024",
    });

    return response.data[0]?.b64_json ?? null;
  } catch (err) {
    console.error(`Image generation failed for ${haircutName}:`, err);
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

      console.log("Analyzing face with AI...");
      const analysis = await analyzeFaceAndGetHaircuts(imageBase64);
      console.log("Face analysis complete, generating haircut images...");

      const imagePromises = analysis.recommendations.map((rec) =>
        generateHaircutImage(imageBase64, rec.name, rec.description)
      );

      const generatedImages = await Promise.all(imagePromises);

      const results = analysis.recommendations.map((rec, i) => ({
        ...rec,
        generatedImage: generatedImages[i]
          ? `data:image/png;base64,${generatedImages[i]}`
          : null,
      }));

      console.log("All done, sending results.");

      res.json({
        faceShape: analysis.faceShape,
        faceFeatures: analysis.faceFeatures,
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
