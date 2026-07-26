import AgentVault from "./AgentVault";
import { seedArtifacts } from "../lib/seed-artifacts";

export default function Home() {
  return <AgentVault initialArtifacts={seedArtifacts} />;
}
