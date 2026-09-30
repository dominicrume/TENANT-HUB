/**
 * "Homes" was renamed to "Properties" at C45. This bare redirect exists so
 * any old link or bookmark to /homes still lands somewhere real.
 */
import { redirect } from "next/navigation";

export default function HomesRedirect() {
  redirect("/properties");
}
