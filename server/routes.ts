import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { db } from "./db";
import { users, posts, ratings, friendships, directMessages, competitions, competitionVotes } from "@shared/schema";
import { eq, desc, and, or, ne, sql, lt, isNotNull } from "drizzle-orm";
import crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ── IMAGE STORAGE ────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function getServerBase(): string {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "http://localhost:5000";
}

function saveImageFile(base64Data: string, ext = "png"): string {
  const filename = `${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(base64Data, "base64");
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  return `${getServerBase()}/uploads/${filename}`;
}

// ── GROQ AI (free, ultra-fast inference) ─────────────────────────────────────
// Uses Groq's free API with llama-4-scout for vision-based face analysis.
let _groq: OpenAI | null = null;
function getGroq(): OpenAI {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("Missing credentials. Please provide GROQ_API_KEY.");
    _groq = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
  }
  return _groq;
}


function hashPassword(p: string): string {
  return crypto.createHash("sha256").update(p + "cutmatch_salt").digest("hex");
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
  const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const response = await getGroq().chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "system",
        content: `You are a professional hair stylist. Analyze the face and return ONLY valid JSON (no markdown, no code blocks):
{"faceShape":"oval|round|square|heart|oblong|diamond","faceFeatures":"brief 1-2 sentence","hasGlasses":false,"hairColor":"color","skinTone":"fair|light|medium|olive|tan|dark brown|deep","gender":"man|woman|person","ageRange":"teens|20s|30s|40s|50s+","recommendations":[{"rank":1,"name":"Name","description":"1 sentence","whyItFits":"1-2 sentences","difficulty":"Easy|Medium|Hard","imagePrompt":"detailed hairstyle prompt for image generation"}]}
Include exactly 4 recommendations. Be concise and fast.`,
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "Analyze and give 4 best haircuts. Return only JSON." },
        ] as any,
      },
    ],
    max_tokens: 1200,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Invalid AI response format");
  return JSON.parse(match[0]);
}

function buildImagePrompt(analysis: FaceAnalysis, rec: HaircutRec): string {
  const glasses = analysis.hasGlasses ? "wearing glasses, " : "";
  return `${analysis.ageRange} ${analysis.gender}, ${analysis.skinTone} skin tone, ${glasses}${rec.name} haircut: ${rec.imagePrompt}. Professional portrait, studio lighting, photorealistic, neutral background.`.slice(0, 500);
}

function buildPollinationsUrl(prompt: string, rank: number): string {
  const encoded = encodeURIComponent(prompt);
  const seed = (rank * 123456 + Date.now()) % 999999;
  return `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&model=turbo&seed=${seed}&nofeed=true`;
}

async function generateImageUrl(analysis: FaceAnalysis, rec: HaircutRec): Promise<string> {
  const prompt = buildImagePrompt(analysis, rec);
  const url = buildPollinationsUrl(prompt, rec.rank);
  console.log(`Rank ${rec.rank}: using Pollinations URL`);
  return url;
}

// ── COMPETITION EXPIRY ───────────────────────────────────────────────────────
async function checkExpiredCompetitions() {
  try {
    const now = new Date();
    const expired = await db
      .select()
      .from(competitions)
      .where(and(eq(competitions.status, "active"), lt(competitions.expiresAt!, now)));

    for (const comp of expired) {
      const challengerVotes = comp.challengerVotes ?? 0;
      const challengeeVotes = comp.challengeeVotes ?? 0;
      const winnerId = challengerVotes >= challengeeVotes ? comp.challengerId : comp.challengeeId;

      await db.update(competitions)
        .set({ status: "completed", winnerId })
        .where(eq(competitions.id, comp.id));

      const [winner] = await db.select().from(users).where(eq(users.id, winnerId));
      const winnerName = winner?.displayName || "Someone";
      const resultMsg = `🏆 CutCompetition Results! ${winnerName} won with ${Math.max(challengerVotes, challengeeVotes)} votes! (${Math.min(challengerVotes, challengeeVotes)} for the other)`;

      for (const [senderId, receiverId] of [
        [comp.challengerId, comp.challengeeId],
        [comp.challengeeId, comp.challengerId],
      ]) {
        await db.insert(directMessages).values({
          senderId,
          receiverId,
          content: resultMsg,
          messageType: "competition_result",
          metadata: { competitionId: comp.id, winnerId },
        });
      }
    }
  } catch (e) {
    console.error("Expiry check error:", e);
  }
}

// Run expiry check every 10 minutes
setInterval(checkExpiredCompetitions, 10 * 60 * 1000);

export async function registerRoutes(app: Express): Promise<Server> {

  // ── STATIC UPLOADS ───────────────────────────────────────────────────────
  app.use("/uploads", express.static(UPLOADS_DIR));

  // ── IMAGE UPLOAD ─────────────────────────────────────────────────────────
  app.post("/api/upload", async (req: Request, res: Response) => {
    try {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "image required" });
      const b64 = image.includes(",") ? image.split(",")[1] : image;
      const url = saveImageFile(b64, "jpg");
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── NON-STREAMING ANALYZE (for registration/avatar) ──────────────────────
  app.post("/api/analyze-simple", async (req: Request, res: Response) => {
    try {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "Image required" });
      const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
      const analysis = await analyzeFace(imageUrl);

      const recsWithImages = [];
      for (const rec of analysis.recommendations) {
        const imageUrl = await generateImageUrl(analysis, rec);
        recsWithImages.push({
          rank: rec.rank, name: rec.name, description: rec.description,
          whyItFits: rec.whyItFits, difficulty: rec.difficulty,
          generatedImage: imageUrl,
        });
      }

      res.json({
        faceShape: analysis.faceShape,
        faceFeatures: analysis.faceFeatures,
        hasGlasses: analysis.hasGlasses,
        recommendations: recsWithImages,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Analysis failed" });
    }
  });

  // ── AUTH ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, displayName } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (clean.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
      if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });

      const [existing] = await db.select().from(users).where(eq(users.username, clean));
      if (existing) return res.status(409).json({ error: "Username already taken" });

      const name = (displayName || clean).trim();
      const [user] = await db.insert(users)
        .values({ username: clean, displayName: name, password: hashPassword(password) })
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
      if (user.password !== hashed && user.password !== "") return res.status(401).json({ error: "Invalid username or password" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── STREAMING ANALYZE (SSE) ───────────────────────────────────────────────
  app.post("/api/analyze-stream", async (req: Request, res: Response) => {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "Image required" });

    const imageBase64 = image.includes(",") ? image.split(",")[1] : image;
    const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${imageBase64}`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const send = (type: string, data: any) => {
      try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
    };

    try {
      send("status", { message: "Analyzing your face shape..." });

      const analysis = await analyzeFace(imageUrl);

      send("analysis", {
        faceShape: analysis.faceShape,
        faceFeatures: analysis.faceFeatures,
        hasGlasses: analysis.hasGlasses,
        gender: analysis.gender,
        skinTone: analysis.skinTone,
        recommendations: analysis.recommendations.map((r) => ({
          rank: r.rank, name: r.name, description: r.description,
          whyItFits: r.whyItFits, difficulty: r.difficulty, generatedImage: null,
        })),
      });

      send("status", { message: "Generating your AI looks..." });

      for (const rec of analysis.recommendations) {
        const imageUrl = await generateImageUrl(analysis, rec);
        send("image", { rank: rec.rank, generatedImage: imageUrl });
      }

      send("done", {});
      res.end();
    } catch (error: any) {
      send("error", { message: error.message || "Analysis failed" });
      res.end();
    }
  });

  // ── AVATAR ────────────────────────────────────────────────────────────────
  app.post("/api/users/:id/avatar", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      let { avatarUrl } = req.body;
      if (!avatarUrl) return res.status(400).json({ error: "avatarUrl required" });
      // If it's a base64 data URL, save to file
      if (avatarUrl.startsWith("data:")) {
        const b64 = avatarUrl.split(",")[1];
        avatarUrl = saveImageFile(b64, "jpg");
      }
      const [updated] = await db.update(users).set({ avatarUrl }).where(eq(users.id, userId)).returning();
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── USERS ─────────────────────────────────────────────────────────────────
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
      const [user] = await db.insert(users).values({ username, displayName, password: "" }).returning();
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

  // ── FEED ──────────────────────────────────────────────────────────────────
  app.get("/api/feed", async (req: Request, res: Response) => {
    try {
      // Regular posts
      const regularPosts = await db
        .select({
          post: posts,
          user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
        })
        .from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .where(and(eq(posts.isPublic, true), eq(posts.postType, "cutmatch")))
        .orderBy(desc(posts.createdAt))
        .limit(50);

      // Visible competitions: active (both submitted) OR pending with challenger's post already submitted
      const activeComps = await db
        .select()
        .from(competitions)
        .where(
          or(
            eq(competitions.status, "active"),
            and(eq(competitions.status, "pending"), isNotNull(competitions.challengerPostId))
          )
        )
        .orderBy(desc(competitions.createdAt))
        .limit(10);

      // Enrich competitions with user and post data
      const enrichedComps = await Promise.all(activeComps.map(async (comp) => {
        const [cUser] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
          .from(users).where(eq(users.id, comp.challengerId));
        const [eUser] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
          .from(users).where(eq(users.id, comp.challengeeId));

        let challengerPost = null, challengeePost = null;
        if (comp.challengerPostId) {
          const [row] = await db.select().from(posts).where(eq(posts.id, comp.challengerPostId));
          challengerPost = row;
        }
        if (comp.challengeePostId) {
          const [row] = await db.select().from(posts).where(eq(posts.id, comp.challengeePostId));
          challengeePost = row;
        }

        return {
          type: "competition",
          competition: comp,
          challengerUser: cUser,
          challengeeUser: eUser,
          challengerPost,
          challengeePost,
        };
      }));

      res.json({ posts: regularPosts, competitions: enrichedComps });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const [row] = await db
        .select({ post: posts, user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl } })
        .from(posts).innerJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.id, parseInt(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/users/:id/posts", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const userPosts = await db.select().from(posts).where(eq(posts.userId, userId)).orderBy(desc(posts.createdAt)).limit(20);
      res.json(userPosts);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      const { userId, facePhotoUrl, faceShape, faceFeatures, hasGlasses, recommendations, caption, isPublic, postType } = req.body;
      // If facePhotoUrl is a base64 data URL, save to file
      let photoUrl = facePhotoUrl;
      if (photoUrl && photoUrl.startsWith("data:")) {
        const b64 = photoUrl.split(",")[1];
        photoUrl = saveImageFile(b64, "jpg");
      }
      const [post] = await db
        .insert(posts)
        .values({ userId, facePhotoUrl: photoUrl, faceShape, faceFeatures, hasGlasses, recommendations, caption, isPublic, postType: postType || "cutmatch" })
        .returning();
      res.status(201).json(post);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ── RATINGS ───────────────────────────────────────────────────────────────
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

  // ── FRIENDS ───────────────────────────────────────────────────────────────
  app.post("/api/friends/request", async (req: Request, res: Response) => {
    try {
      const { requesterId, addresseeId } = req.body;
      const [existing] = await db.select().from(friendships).where(or(
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
      const accepted = await db.select().from(friendships).where(and(
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        eq(friendships.status, "accepted")
      ));
      const friendIds = accepted.map((f) => f.requesterId === userId ? f.addresseeId : f.requesterId);
      const friendList = friendIds.length
        ? await db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
            .from(users).where(or(...friendIds.map((id) => eq(users.id, id))))
        : [];
      res.json(friendList);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── MESSAGES ──────────────────────────────────────────────────────────────
  app.get("/api/messages/:userId/:otherId", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const otherId = parseInt(req.params.otherId);
      const msgs = await db.select().from(directMessages).where(or(
        and(eq(directMessages.senderId, userId), eq(directMessages.receiverId, otherId)),
        and(eq(directMessages.senderId, otherId), eq(directMessages.receiverId, userId))
      )).orderBy(directMessages.createdAt);
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

  // ── COMPETITIONS ──────────────────────────────────────────────────────────
  app.post("/api/competitions", async (req: Request, res: Response) => {
    try {
      const { challengerId, challengeeId } = req.body;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [comp] = await db.insert(competitions)
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
      if (comp.expiresAt && now > comp.expiresAt && comp.status === "active") {
        const winnerId = (comp.challengerVotes ?? 0) >= (comp.challengeeVotes ?? 0) ? comp.challengerId : comp.challengeeId;
        const [updated] = await db.update(competitions).set({ status: "completed", winnerId }).where(eq(competitions.id, compId)).returning();
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

      // Both submitted — activate competition
      if (newChallengerPostId && newChallengeePostId) {
        updates.status = "active";
        updates.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      const [updated] = await db.update(competitions).set(updates).where(eq(competitions.id, compId)).returning();

      // Notify both participants when activated
      if (updates.status === "active") {
        const [cUser] = await db.select().from(users).where(eq(users.id, comp.challengerId));
        const [eUser] = await db.select().from(users).where(eq(users.id, comp.challengeeId));
        const activateMsg = `⚔️ CutCompetition is now LIVE! Both cuts are submitted. Voting ends in 24 hours — share the competition to get votes!`;
        await db.insert(directMessages).values([
          { senderId: comp.challengerId, receiverId: comp.challengeeId, content: activateMsg, messageType: "competition_invite", metadata: { competitionId: compId } },
          { senderId: comp.challengeeId, receiverId: comp.challengerId, content: activateMsg, messageType: "competition_invite", metadata: { competitionId: compId } },
        ]);
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/competitions/:id/vote", async (req: Request, res: Response) => {
    try {
      const compId = parseInt(req.params.id);
      const { votedForUserId, voterId } = req.body;
      if (!voterId) return res.status(400).json({ error: "voterId required" });

      const [comp] = await db.select().from(competitions).where(eq(competitions.id, compId));
      if (!comp) return res.status(404).json({ error: "Not found" });
      if (comp.status !== "active") return res.status(400).json({ error: "Competition not active" });

      const [existingVote] = await db.select().from(competitionVotes)
        .where(and(eq(competitionVotes.competitionId, compId), eq(competitionVotes.userId, voterId)));
      if (existingVote) return res.status(409).json({ error: "Already voted", alreadyVoted: true, votedForUserId: existingVote.votedForUserId });

      const updates: any = {};
      if (comp.challengerId === votedForUserId) updates.challengerVotes = (comp.challengerVotes ?? 0) + 1;
      else if (comp.challengeeId === votedForUserId) updates.challengeeVotes = (comp.challengeeVotes ?? 0) + 1;
      else return res.status(400).json({ error: "Invalid vote target" });

      await db.insert(competitionVotes).values({ competitionId: compId, userId: voterId, votedForUserId });
      const [updated] = await db.update(competitions).set(updates).where(eq(competitions.id, compId)).returning();
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes("unique_competition_user_vote")) {
        return res.status(409).json({ error: "Already voted", alreadyVoted: true });
      }
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/competitions/:id/my-vote", async (req: Request, res: Response) => {
    try {
      const compId = parseInt(req.params.id);
      const userId = parseInt(req.query.userId as string);
      if (!userId) return res.json({ voted: false });
      const [vote] = await db.select().from(competitionVotes)
        .where(and(eq(competitionVotes.competitionId, compId), eq(competitionVotes.userId, userId)));
      if (vote) return res.json({ voted: true, votedForUserId: vote.votedForUserId });
      res.json({ voted: false });
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/users/:userId/competitions", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const userComps = await db.select().from(competitions)
        .where(or(eq(competitions.challengerId, userId), eq(competitions.challengeeId, userId)))
        .orderBy(desc(competitions.createdAt));
      res.json(userComps);
    } catch { res.status(500).json({ error: "Server error" }); }
  });

  // ── AI HAIR ADVISOR ───────────────────────────────────────────────────────
  interface AdvisorMessage {
    role: "user" | "assistant";
    content: string;
  }

  app.post("/api/ai-advisor", async (req: Request, res: Response) => {
    try {
      const { messages: history, faceShape } = req.body as { messages: AdvisorMessage[]; faceShape?: string | null };
      if (!Array.isArray(history)) return res.status(400).json({ error: "messages array required" });

      const faceShapeNote = faceShape ? ` The user's face shape is ${faceShape} — tailor your advice accordingly.` : "";

      const systemPrompt = `You are an expert hair stylist and personal hair advisor for the CutMatch app.${faceShapeNote}
You give friendly, practical, personalized advice about haircuts, hairstyles, face shapes, hair care, and grooming.
Keep responses concise and helpful — 1-4 sentences unless more detail is needed. Use casual, warm language.
Never be dismissive. If unsure, offer general guidance and encourage the user to consult a local stylist.`;

      const chatHistory = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await getGroq().chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory,
        ],
        max_tokens: 400,
        temperature: 0.75,
      });

      const reply = response.choices[0]?.message?.content?.trim() || "I'm not sure about that. Try asking me something else!";
      res.json({ reply });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "AI advisor error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
