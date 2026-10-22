import { verifyIntegrationDatabaseTarget } from "./test-database";

export default async function setupIntegrationDatabase(): Promise<void> {
  await verifyIntegrationDatabaseTarget();
}
