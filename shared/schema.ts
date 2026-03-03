import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").default(""),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  facePhotoUrl: text("face_photo_url").notNull(),
  faceShape: text("face_shape").notNull(),
  faceFeatures: text("face_features").notNull(),
  hasGlasses: boolean("has_glasses").default(false),
  recommendations: jsonb("recommendations").notNull(),
  caption: text("caption").default(""),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const ratings = pgTable("ratings", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const friendships = pgTable("friendships", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addresseeId: integer("addressee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: integer("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });
export const insertRatingSchema = createInsertSchema(ratings).omit({ id: true, createdAt: true });
export const insertFriendshipSchema = createInsertSchema(friendships).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(directMessages).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Rating = typeof ratings.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
