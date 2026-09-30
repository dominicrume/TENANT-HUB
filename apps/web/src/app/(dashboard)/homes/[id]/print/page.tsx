/** Old "/homes/[id]/print" link → the same poster, now at "/properties/[id]/print" (C45). */
import { redirect } from "next/navigation";

export default function HomePrintRedirect({ params }: { params: { id: string } }) {
  redirect(`/properties/${params.id}/print`);
}
