import { CloudControlPanel } from "../../components/cloud-control";
import { DenPageShell } from "../../components/den-page-shell";

export default function DashboardPage() {
  return (
    <DenPageShell>
      <CloudControlPanel route="dashboard" />
    </DenPageShell>
  );
}
