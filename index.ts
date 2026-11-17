import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { patients, scans, supportMessages, users } from "../../db/schema";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSession,
  destroySession,
  hashPassword,
  userFromToken,
  verifyPassword,
} from "../../server/auth";
import { analyzeImage } from "../../server/analyze";
import { loadImage, saveImage } from "../../server/storage";

type AuthUser = { id: string; name: string; email: string };
const app = new Hono<{ Variables: { user: AuthUser } }>().basePath("/api");

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MODALITIES = ["X-ray", "CT", "MRI"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readJson = async (c: { req: { json: () => Promise<any> } }) => (await c.req.json().catch(() => ({}))) ?? {};
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

function setSession(c: any, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

const requireAuth = async (c: any, next: () => Promise<void>) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await userFromToken(token) : null;
  if (!user) return c.json({ error: "Please log in to continue." }, 401);
  c.set("user", user);
  await next();
};

const toScan = (s: typeof scans.$inferSelect, patientName: string | null = null) => {
  const { storageKey, userId, ...rest } = s;
  return { ...rest, patientName, imageUrl: `/api/scans/${s.id}/image` };
};

// ---------- Auth ----------
app.post("/auth/signup", async (c) => {
  const b = await readJson(c);
  const name = text(b.name, 80);
  const email = text(b.email, 120).toLowerCase();
  const password = String(b.password ?? "");
  if (!name) return c.json({ error: "Enter your name." }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: "Enter a valid email address." }, 400);
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return c.json({ error: "An account with this email already exists." }, 409);
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, name: users.name, email: users.email });
  setSession(c, await createSession(user.id));
  return c.json({ user }, 201);
});

app.post("/auth/login", async (c) => {
  const b = await readJson(c);
  const email = text(b.email, 120).toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row || !(await verifyPassword(String(b.password ?? ""), row.passwordHash))) {
    return c.json({ error: "Email or password is incorrect." }, 401);
  }
  setSession(c, await createSession(row.id));
  return c.json({ user: { id: row.id, name: row.name, email: row.email } });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await destroySession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/auth/me", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await userFromToken(token) : null;
  return c.json({ user });
});

// ---------- Profile ----------
app.put("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const name = text((await readJson(c)).name, 80);
  if (!name) return c.json({ error: "Enter your name." }, 400);
  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return c.json({ user: { ...user, name } });
});

app.post("/profile/password", requireAuth, async (c) => {
  const user = c.get("user");
  const b = await readJson(c);
  const next = String(b.next ?? "");
  if (next.length < 8) return c.json({ error: "New password must be at least 8 characters." }, 400);
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(String(b.current ?? ""), row.passwordHash))) {
    return c.json({ error: "Current password is incorrect." }, 400);
  }
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  return c.json({ ok: true });
});

// ---------- Patients ----------
app.get("/patients", requireAuth, async (c) => {
  const rows = await db.select().from(patients).where(eq(patients.userId, c.get("user").id)).orderBy(desc(patients.createdAt));
  return c.json(rows);
});

app.post("/patients", requireAuth, async (c) => {
  const b = await readJson(c);
  const name = text(b.name, 120);
  if (!name) return c.json({ error: "Enter the patient's name." }, 400);
  const age = b.age === "" || b.age == null ? null : Number(b.age);
  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) {
    return c.json({ error: "Age must be a whole number from 0 to 120." }, 400);
  }
  const [row] = await db
    .insert(patients)
    .values({ userId: c.get("user").id, name, age, sex: text(b.sex, 20) || null, mrn: text(b.mrn, 60) || null, notes: text(b.notes, 500) || null })
    .returning();
  return c.json(row, 201);
});

app.delete("/patients/:id", requireAuth, async (c) => {
  await db.delete(patients).where(and(eq(patients.id, c.req.param("id")), eq(patients.userId, c.get("user").id)));
  return c.json({ ok: true });
});

// ---------- Scans ----------
app.get("/scans", requireAuth, async (c) => {
  const rows = await db
    .select({ scan: scans, patientName: patients.name })
    .from(scans)
    .leftJoin(patients, eq(scans.patientId, patients.id))
    .where(eq(scans.userId, c.get("user").id))
    .orderBy(desc(scans.createdAt));
  return c.json(rows.map((r) => toScan(r.scan, r.patientName)));
});

app.get("/scans/:id", requireAuth, async (c) => {
  const [r] = await db
    .select({ scan: scans, patientName: patients.name })
    .from(scans)
    .leftJoin(patients, eq(scans.patientId, patients.id))
    .where(and(eq(scans.id, c.req.param("id")), eq(scans.userId, c.get("user").id)))
    .limit(1);
  if (!r) return c.json({ error: "Scan not found." }, 404);
  return c.json(toScan(r.scan, r.patientName));
});

app.get("/scans/:id/image", requireAuth, async (c) => {
  const [row] = await db
    .select({ key: scans.storageKey })
    .from(scans)
    .where(and(eq(scans.id, c.req.param("id")), eq(scans.userId, c.get("user").id)))
    .limit(1);
  const img = row ? await loadImage(row.key) : null;
  if (!img) return c.json({ error: "Image not found." }, 404);
  return new Response(img.bytes, {
    headers: { "Content-Type": img.contentType, "Cache-Control": "private, max-age=3600" },
  });
});

app.post("/scans", requireAuth, async (c) => {
  const user = c.get("user");
  const form = await c.req.parseBody();
  const file = form["image"];
  if (!(file instanceof File)) return c.json({ error: "Choose an image to upload." }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: "Upload a JPEG, PNG or WebP image." }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "Image must be 10 MB or smaller." }, 400);
  const modality = text(form["modality"], 10);
  if (!MODALITIES.includes(modality)) return c.json({ error: "Choose X-ray, CT or MRI." }, 400);

  let patientId: string | null = text(form["patientId"], 60) || null;
  if (patientId) {
    const [owned] = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.userId, user.id)))
      .limit(1);
    if (!owned) patientId = null;
  }

  const bytes = await file.arrayBuffer();
  const storageKey = crypto.randomUUID();
  await saveImage(storageKey, bytes, file.type);
  const [scan] = await db
    .insert(scans)
    .values({ userId: user.id, patientId, modality, status: "processing", storageKey, filename: file.name.slice(0, 120) })
    .returning();

  try {
    const result = await analyzeImage(bytes, file.type, modality);
    const [done] = await db
      .update(scans)
      .set({ status: "complete", ...result })
      .where(eq(scans.id, scan.id))
      .returning();
    return c.json(toScan(done), 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    const [failed] = await db.update(scans).set({ status: "failed", error: message }).where(eq(scans.id, scan.id)).returning();
    return c.json(toScan(failed), 201);
  }
});

app.delete("/scans/:id", requireAuth, async (c) => {
  await db.delete(scans).where(and(eq(scans.id, c.req.param("id")), eq(scans.userId, c.get("user").id)));
  return c.json({ ok: true });
});

// ---------- Support ----------
app.get("/support", requireAuth, async (c) => {
  const rows = await db.select().from(supportMessages).where(eq(supportMessages.userId, c.get("user").id)).orderBy(desc(supportMessages.createdAt));
  return c.json(rows);
});

app.post("/support", requireAuth, async (c) => {
  const b = await readJson(c);
  const subject = text(b.subject, 120);
  const message = text(b.message, 2000);
  if (!subject || !message) return c.json({ error: "Enter a subject and a message." }, 400);
  const [row] = await db.insert(supportMessages).values({ userId: c.get("user").id, subject, message }).returning();
  return c.json(row, 201);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong on the server. Try again." }, 500);
});

export const config = { path: "/api/*" };
export default (req: Request) => app.fetch(req);
