import { CloudControlPanel } from "../components/cloud-control";
import { DenPageShell } from "../components/den-page-shell";

export default function HomePage() {
  return (
    <DenPageShell>
      <CloudControlPanel route="start" />
    </DenPageShell>
  );
}
