/** Old "/homes/[id]" link → the same property, now at "/properties/[id]" (C45). */
import { redirect } from "next/navigation";

export default function HomeDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/properties/${params.id}`);
}
