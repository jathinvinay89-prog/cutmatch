import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  password: text("password").notNull().default(""),
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
  postType: text("post_type").default("cutmatch"),
  expiresAt: timestamp("expires_at"),
  isExpired: boolean("is_expired").default(false),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => ({
  postsUserIdIdx: index("posts_user_id_idx").on(table.userId),
  postsPublicTypeCreatedIdx: index("posts_public_type_created_idx").on(table.isPublic, table.postType, table.createdAt),
  postsCreatedAtIdx: index("posts_created_at_idx").on(table.createdAt),
}));

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
  messageType: text("message_type").notNull().default("text"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const competitions = pgTable("competitions", {
  id: serial("id").primaryKey(),
  challengerId: integer("challenger_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  challengeeId: integer("challengee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  challengerPostId: integer("challenger_post_id").references(() => posts.id, { onDelete: "set null" }),
  challengeePostId: integer("challengee_post_id").references(() => posts.id, { onDelete: "set null" }),
  challengerVotes: integer("challenger_votes").default(0),
  challengeeVotes: integer("challengee_votes").default(0),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at"),
  winnerId: integer("winner_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => ({
  competitionsStatusCreatedIdx: index("competitions_status_created_idx").on(table.status, table.createdAt),
  competitionsChallengerIdx: index("competitions_challenger_id_idx").on(table.challengerId),
  competitionsChallengeeeIdx: index("competitions_challengee_id_idx").on(table.challengeeId),
}));

export const competitionVotes = pgTable("competition_votes", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  votedForUserId: integer("voted_for_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => ({
  uniqueVote: unique("unique_competition_user_vote").on(table.competitionId, table.userId),
}));

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });
export const insertRatingSchema = createInsertSchema(ratings).omit({ id: true, createdAt: true });
export const insertFriendshipSchema = createInsertSchema(friendships).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(directMessages).omit({ id: true, createdAt: true });
export const insertCompetitionSchema = createInsertSchema(competitions).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Rating = typeof ratings.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type CompetitionVote = typeof competitionVotes.$inferSelect;
