/**
 * /dashboard/signin — permanent redirect to /signin.
 *
 * The token-paste stub has been replaced by the magic-link flow at /signin.
 * This file exists only to preserve old links.
 */

import { redirect } from "next/navigation";

export default function DashboardSignInRedirect() {
  redirect("/signin");
}
