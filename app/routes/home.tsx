import CenteredMessage from "@/components/centered-message";
import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Neves Labs · Client portal" }];
}

export default function Home(): React.ReactNode {
  return (
    <CenteredMessage
      title="Neves Labs · Client portal"
      detail="Private portal for Neves Labs clients."
    />
  );
}
