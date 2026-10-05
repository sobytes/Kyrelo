import { getAiUsage, modifyAiUsage } from "./storage";

// A daily cap on the AI drafts Kyrelo makes on its own (Autopilot under new
// tweets, Comments under new comments), so a busy keyword or a viral post
// can't run up the AI bill overnight. Drafts the user asks for aren't capped.

const today = () => new Date().toISOString().slice(0, 10);

/** Counts one background draft against today's limit; false (and nothing counted) once it's reached. */
export async function takeBackgroundDraft(): Promise<boolean> {
  let allowed = false;
  await modifyAiUsage((u) => {
    const drafts = u.day === today() ? u.drafts : 0;
    allowed = drafts < u.dailyDraftLimit;
    return { ...u, day: today(), drafts: allowed ? drafts + 1 : drafts };
  });
  return allowed;
}

/** Today's count and the limit, for Settings. */
export async function aiUsageToday(): Promise<{ drafts: number; dailyDraftLimit: number }> {
  const u = await getAiUsage();
  return { drafts: u.day === today() ? u.drafts : 0, dailyDraftLimit: u.dailyDraftLimit };
}

export async function setDailyDraftLimit(limit: number): Promise<void> {
  const clean = Math.max(0, Math.min(5000, Math.round(limit)));
  await modifyAiUsage((u) => ({ ...u, dailyDraftLimit: clean }));
}
