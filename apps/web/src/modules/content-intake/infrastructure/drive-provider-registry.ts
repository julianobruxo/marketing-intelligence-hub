import { DRIVE_PROVIDER_MODE } from "@/shared/config/env";
import type { DriveProvider } from "./drive-provider-contract";
import { mockDriveProvider } from "./mock-drive-provider";
import { realDriveProvider } from "./real-drive-provider";

export function getDriveProvider(): DriveProvider {
  return DRIVE_PROVIDER_MODE === "REAL" ? realDriveProvider : mockDriveProvider;
}
