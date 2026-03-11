import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { db } from "./db";
import { users, posts, ratings, friendships, directMessages } from "@shared/schema";
import { eq, desc, and, or, ne } from "drizzle-orm";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

interface HaircutRec {
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
  recommendations: HaircutRec[];
}

async function analyzeFace(imageBase64: string): Promise<FaceAnalysis> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content: `You are a professional hair stylist. Analyze the face and recommend 4 haircuts.
Return ONLY valid JSON (no markdown):
{
  "faceShape": "oval|round|square|heart|oblong|diamond",
  "faceFeatures": "brief 1-2 sentence description",
  "hasGlasses": true or false,
  "hairColor": "natural hair color",
  "skinTone": "fair|light|medium|olive|tan|dark brown|deep",
  "gender": "man|woman|person",
  "ageRange": "teens|20s|30s|40s|50s+",
  "recommendations": [
    {
      "rank": 1,
      "name": "Haircut Name",
      "description": "Clear 1-sentence description",
      "whyItFits": "Why suits this face (1-2 sentences)",
      "difficulty": "Easy|Medium|Hard",
      "imagePrompt": "Detailed hairstyle description: exact lengths, fade type, texture, styling, top vs sides"
    }
  ]
}`,
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: "text", text: "Analyze face and give 4 best haircuts with detailed image prompts." },
        ],
      },
    ],
    max_completion_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Invalid AI response");
  return JSON.parse(match[0]);
}

async function generateHaircutImage(analysis: FaceAnalysis, rec: HaircutRec): Promise<string | null> {
  try {
    const glasses = analysis.hasGlasses ? "wearing stylish glasses, " : "";
    const prompt = `Professional studio portrait photograph of a ${analysis.ageRange} ${analysis.gender} with ${analysis.skinTone} skin, ${glasses}with this exact hairstyle:

${rec.name}: ${rec.imagePrompt}
Details: ${rec.description}

Clean neutral background, soft studio lighting, photorealistic, high quality, sharp focus on hair and face, professional portrait style.`;

    const response = await getOpenAI().images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "low",
    });

    return response.data[0]?.b64_json ?? null;
  } catch (err: any) {
    console.error(`Image gen failed for ${rec.name}:`, err?.message);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ── STREAMING ANALYZE (SSE) ──────────────────────────────────────────
  app.post("/api/analyze-stream", async (req: Request, res: Response) => {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "Image required" });

    const imageBase64 = image.includes(",") ? image.split(",")[1] : image;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (type: string, data: any) => {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
      send("status", { message: "Analyzing your face..." });

      const analysis = await analyzeFace(imageBase64);
      send("analysis", {
        faceShape: analysis.faceShape,
        faceFeatures: analysis.faceFeatures,
        hasGlasses: analysis.hasGlasses,
        gender: analysis.gender,
        skinTone: analysis.skinTone,
        recommendations: analysis.recommendations.map((r) => ({
          rank: r.rank,
          name: r.name,
          description: r.description,
          whyItFits: r.whyItFits,
          difficulty: r.difficulty,
          generatedImage: null,
        })),
      });

      send("status", { message: "Generating your AI haircut looks..." });

      await Promise.all(
        analysis.recommendations.map(async (rec) => {
          const b64 = await generateHaircutImage(analysis, rec);
          send("image", {
            rank: rec.rank,
            generatedImage: b64 ? `data:image/png;base64,${b64}` : null,
          });
        })
      );

      send("done", {});
      res.end();
    } catch (error: any) {
      send("error", { message: error.message || "Analysis failed" });
      res.end();
    }
  });

  // ── USERS ────────────────────────────────────────────────────────────
  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, parseInt(req.params.id)));
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const { username, displayName } = req.body;
      const [user] = await db
        .insert(users)
        .values({ username, displayName })
        .returning();
      res.status(201).json(user);
    } catch (err: any) {
      if (err.message?.includes("unique")) return res.status(409).json({ error: "Username taken" });
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/users/by-username/:username", async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, req.params.username));
      if (!user) return res.status(404).json({ error: "Not found" });
      res.json(user);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── FEED ─────────────────────────────────────────────────────────────
  app.get("/api/feed", async (req: Request, res: Response) => {
    try {
      const feed = await db
        .select({
          post: posts,
          user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
        })
        .from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.isPublic, true))
        .orderBy(desc(posts.createdAt))
        .limit(50);
      res.json(feed);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const [row] = await db
        .select({
          post: posts,
          user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
        })
        .from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.id, parseInt(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      const { userId, facePhotoUrl, faceShape, faceFeatures, hasGlasses, recommendations, caption, isPublic } = req.body;
      const [post] = await db
        .insert(posts)
        .values({ userId, facePhotoUrl, faceShape, faceFeatures, hasGlasses, recommendations, caption, isPublic })
        .returning();
      res.status(201).json(post);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── RATINGS ──────────────────────────────────────────────────────────
  app.post("/api/posts/:id/rate", async (req: Request, res: Response) => {
    try {
      const { userId, rank } = req.body;
      const postId = parseInt(req.params.id);
      await db.delete(ratings).where(and(eq(ratings.postId, postId), eq(ratings.userId, userId)));
      const [rating] = await db.insert(ratings).values({ postId, userId, rank }).returning();
      res.json(rating);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/posts/:id/ratings", async (req: Request, res: Response) => {
    try {
      const postRatings = await db.select().from(ratings).where(eq(ratings.postId, parseInt(req.params.id)));
      const counts: Record<number, number> = {};
      postRatings.forEach((r) => { counts[r.rank] = (counts[r.rank] || 0) + 1; });
      res.json({ ratings: postRatings, counts });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── FRIENDS ──────────────────────────────────────────────────────────
  app.post("/api/friends/request", async (req: Request, res: Response) => {
    try {
      const { requesterId, addresseeId } = req.body;
      const [existing] = await db
        .select()
        .from(friendships)
        .where(or(
          and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
          and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId))
        ));
      if (existing) {
        if (existing.status === "pending") {
          const [updated] = await db.update(friendships).set({ status: "accepted" }).where(eq(friendships.id, existing.id)).returning();
          return res.json(updated);
        }
        return res.json(existing);
      }
      const [friendship] = await db.insert(friendships).values({ requesterId, addresseeId }).returning();
      res.status(201).json(friendship);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/friends/:userId", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const accepted = await db
        .select()
        .from(friendships)
        .where(and(
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
          eq(friendships.status, "accepted")
        ));
      const friendIds = accepted.map((f) => f.requesterId === userId ? f.addresseeId : f.requesterId);
      const friendList = friendIds.length
        ? await db.select().from(users).where(or(...friendIds.map((id) => eq(users.id, id))))
        : [];
      res.json(friendList);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── MESSAGES ─────────────────────────────────────────────────────────
  app.get("/api/messages/:userId/:otherId", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const otherId = parseInt(req.params.otherId);
      const msgs = await db
        .select()
        .from(directMessages)
        .where(or(
          and(eq(directMessages.senderId, userId), eq(directMessages.receiverId, otherId)),
          and(eq(directMessages.senderId, otherId), eq(directMessages.receiverId, userId))
        ))
        .orderBy(directMessages.createdAt);
      res.json(msgs);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const { senderId, receiverId, content } = req.body;
      const [msg] = await db.insert(directMessages).values({ senderId, receiverId, content }).returning();
      res.status(201).json(msg);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}
