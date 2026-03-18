import { CloudControlPanel } from "../../components/cloud-control";
import { DenPageShell } from "../../components/den-page-shell";

export default function CheckoutPage() {
  return (
    <DenPageShell>
      <CloudControlPanel route="checkout" />
    </DenPageShell>
  );
}
