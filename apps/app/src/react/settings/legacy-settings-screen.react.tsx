/** @jsxImportSource react */
import { SolidSlot } from "../../app/shell/solid-slot";

type LegacySettingsScreenProps = {
  slotId: string;
  renderContent: () => any;
};

export function LegacySettingsScreen(props: LegacySettingsScreenProps) {
  return <SolidSlot slotId={props.slotId} renderContent={props.renderContent} />;
}

export default LegacySettingsScreen;
