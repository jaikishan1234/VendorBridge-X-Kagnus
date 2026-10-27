import {
  provisionProcurementOfficer,
  type ProcurementOfficerProvisionInput,
  type ProvisionProcurementOfficerResult,
} from "../../src/lib/provisioning/procurement-officer";
import {
  createIntegrationDatabase,
  verifyIntegrationDatabaseTarget,
} from "../../tests/integration/test-database";

type ProvisionDependencies = {
  createDatabase: typeof createIntegrationDatabase;
  provision: typeof provisionProcurementOfficer;
  verifyTarget: typeof verifyIntegrationDatabaseTarget;
};

const defaultDependencies: ProvisionDependencies = {
  createDatabase: createIntegrationDatabase,
  provision: provisionProcurementOfficer,
  verifyTarget: verifyIntegrationDatabaseTarget,
};

export async function provisionVerifiedTestProcurementOfficer(
  input: ProcurementOfficerProvisionInput,
  dependencies: ProvisionDependencies = defaultDependencies,
): Promise<ProvisionProcurementOfficerResult> {
  await dependencies.verifyTarget();

  const { db, pool } = dependencies.createDatabase();

  try {
    return await dependencies.provision(input, db);
  } finally {
    await pool.end();
  }
}
