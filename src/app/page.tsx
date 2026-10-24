import { redirect } from "next/navigation";
import { getSessionState } from "./session";

/**
 * Home (Task 26.1): send a signed-in user to their role's landing page, as
 * reported by `GET /api/session`, and everyone else to the account picker.
 */
export default async function Home() {
  const { current } = await getSessionState();
  redirect(current !== null ? current.landing : "/login");
}
