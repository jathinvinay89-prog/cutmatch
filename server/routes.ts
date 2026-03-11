import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { db } from "./db";
import { users, posts, ratings, friendships, directMessages, competitions } from "@shared/schema";
import { eq, desc, and, or, ne, sql } from "drizzle-orm";
import crypto from "crypto";

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

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "cutmatch_salt").digest("hex");
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
    model: "gpt-4o",
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
          { type: "text", text: "Analyze face and give 4 best haircuts with detailed image prompts. Be very fast and concise." },
        ],
      },
    ],
    max_completion_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Invalid AI response");
  return JSON.parse(match[0]);
}

async function generateHaircutImage(analysis: FaceAnalysis, rec: HaircutRec): Promise<string | null> {
  try {
    const glasses = analysis.hasGlasses ? "wearing stylish glasses, " : "";
    const prompt = `Professional portrait of ${analysis.ageRange} ${analysis.gender}, ${analysis.skinTone} skin, ${glasses}${rec.name} hairstyle: ${rec.imagePrompt}. Studio lighting, photorealistic, high quality, neutral background.`;

    const response = await getOpenAI().images.generate({
      model: "dall-e-2",
      prompt: prompt.slice(0, 999),
      size: "512x512",
      n: 1,
    });

    const url = response.data[0]?.url;
    if (!url) return null;
    const imgRes = await fetch(url);
    const buf = await imgRes.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch (err: any) {
    console.error(`Image gen failed for ${rec.name}:`, err?.message);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ── AUTH ──────────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, displayName } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
      if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
      const hashed = hashPassword(password);
      const name = (displayName || clean).trim();
      const [user] = await db
        .insert(users)
        .values({ username: clean, displayName: name, password: hashed })
        .returning();
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err: any) {
      if (err.message?.includes("unique")) return res.status(409).json({ error: "Username already taken" });
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const clean = username.trim().toLowerCase();
      const [user] = await db.select().from(users).where(eq(users.username, clean));
      if (!user) return res.status(401).json({ error: "Invalid username or password" });
      const hashed = hashPassword(password);
      if (user.password !== hashed && user.password !== "") {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

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

      send("status", { message: "Generating AI looks..." });

      const sorted = [...analysis.recommendations].sort((a, b) => a.rank - b.rank);
      for (const rec of sorted) {
        const b64 = await generateHaircutImage(analysis, rec);
        send("image", {
          rank: rec.rank,
          generatedImage: b64 ? `data:image/png;base64,${b64}` : null,
        });
      }

      send("done", {});
      res.end();
    } catch (error: any) {
      send("error", { message: error.message || "Analysis failed" });
      res.end();
    }
  });

  // ── AVATAR UPLOAD ─────────────────────────────────────────────────────
  app.post("/api/users/:id/avatar", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { avatarUrl } = req.body;
      if (!avatarUrl) return res.status(400).json({ error: "avatarUrl required" });
      const [updated] = await db.update(users).set({ avatarUrl }).where(eq(users.id, userId)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── USERS ────────────────────────────────────────────────────────────
  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, parseInt(req.params.id)));
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const { username, displayName } = req.body;
      const [user] = await db
        .insert(users)
        .values({ username, displayName, password: "" })
        .returning();
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err: any) {
      if (err.message?.includes("unique")) return res.status(409).json({ error: "Username taken" });
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/users/by-username/:username", async (req: Request, res: Response) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, req.params.username));
      if (!user) return res.status(404).json({ error: "Not found" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
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

  app.get("/api/users/:id/posts", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const userPosts = await db
        .select()
        .from(posts)
        .where(eq(posts.userId, userId))
        .orderBy(desc(posts.createdAt))
        .limit(20);
      res.json(userPosts);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      const { userId, facePhotoUrl, faceShape, faceFeatures, hasGlasses, recommendations, caption, isPublic, postType } = req.body;
      const [post] = await db
        .insert(posts)
        .values({ userId, facePhotoUrl, faceShape, faceFeatures, hasGlasses, recommendations, caption, isPublic, postType: postType || "cutmatch" })
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
        ? await db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
            .from(users)
            .where(or(...friendIds.map((id) => eq(users.id, id))))
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
      const { senderId, receiverId, content, messageType, metadata } = req.body;
      const [msg] = await db.insert(directMessages).values({
        senderId, receiverId, content,
        messageType: messageType || "text",
        metadata: metadata || null,
      }).returning();
      res.status(201).json(msg);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── COMPETITIONS ──────────────────────────────────────────────────────
  app.post("/api/competitions", async (req: Request, res: Response) => {
    try {
      const { challengerId, challengeeId } = req.body;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [comp] = await db
        .insert(competitions)
        .values({ challengerId, challengeeId, status: "pending", expiresAt })
        .returning();
      res.status(201).json(comp);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/competitions/:id", async (req: Request, res: Response) => {
    try {
      const compId = parseInt(req.params.id);
      const [comp] = await db.select().from(competitions).where(eq(competitions.id, compId));
      if (!comp) return res.status(404).json({ error: "Not found" });

      const now = new Date();
      if (comp.expiresAt && now > comp.expiresAt && comp.status !== "completed") {
        const winnerId = (comp.challengerVotes ?? 0) >= (comp.challengeeVotes ?? 0)
          ? comp.challengerId
          : comp.challengeeId;
        const [updated] = await db.update(competitions)
          .set({ status: "completed", winnerId })
          .where(eq(competitions.id, compId))
          .returning();
        return res.json(updated);
      }
      res.json(comp);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/competitions/:id/submit", async (req: Request, res: Response) => {
    try {
      const compId = parseInt(req.params.id);
      const { userId, postId } = req.body;
      const [comp] = await db.select().from(competitions).where(eq(competitions.id, compId));
      if (!comp) return res.status(404).json({ error: "Not found" });

      const updates: any = {};
      if (comp.challengerId === userId) updates.challengerPostId = postId;
      else if (comp.challengeeId === userId) updates.challengeePostId = postId;
      else return res.status(403).json({ error: "Not a participant" });

      const newChallengerPostId = updates.challengerPostId ?? comp.challengerPostId;
      const newChallengeePostId = updates.challengeePostId ?? comp.challengeePostId;
      if (newChallengerPostId && newChallengeePostId) updates.status = "active";

      const [updated] = await db.update(competitions).set(updates).where(eq(competitions.id, compId)).returning();
      res.json(updated);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/competitions/:id/vote", async (req: Request, res: Response) => {
    try {
      const compId = parseInt(req.params.id);
      const { votedForUserId } = req.body;
      const [comp] = await db.select().from(competitions).where(eq(competitions.id, compId));
      if (!comp) return res.status(404).json({ error: "Not found" });
      if (comp.status !== "active") return res.status(400).json({ error: "Competition not active" });

      const updates: any = {};
      if (comp.challengerId === votedForUserId) {
        updates.challengerVotes = (comp.challengerVotes ?? 0) + 1;
      } else if (comp.challengeeId === votedForUserId) {
        updates.challengeeVotes = (comp.challengeeVotes ?? 0) + 1;
      } else {
        return res.status(400).json({ error: "Invalid vote target" });
      }

      const [updated] = await db.update(competitions).set(updates).where(eq(competitions.id, compId)).returning();
      res.json(updated);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/competitions/active/feed", async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const activeComps = await db
        .select()
        .from(competitions)
        .where(and(eq(competitions.status, "active")))
        .orderBy(desc(competitions.createdAt))
        .limit(10);
      res.json(activeComps);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/users/:userId/competitions", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const userComps = await db
        .select()
        .from(competitions)
        .where(or(eq(competitions.challengerId, userId), eq(competitions.challengeeId, userId)))
        .orderBy(desc(competitions.createdAt));
      res.json(userComps);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}
