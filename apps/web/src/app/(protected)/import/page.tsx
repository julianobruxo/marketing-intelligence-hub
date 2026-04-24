import { DRIVE_PROVIDER_MODE } from "@/shared/config/env";
import { ImportWizard } from "./import-wizard";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <ImportWizard driveProviderMode={DRIVE_PROVIDER_MODE} />
    </div>
  );
}
