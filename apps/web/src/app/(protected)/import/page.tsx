import { AVAILABLE_SHEET_PROFILES } from "@/modules/content-intake/infrastructure/mock-import-provider";
import { ImportWizard } from "./import-wizard";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ImportWizard profiles={[...AVAILABLE_SHEET_PROFILES]} />
    </div>
  );
}
