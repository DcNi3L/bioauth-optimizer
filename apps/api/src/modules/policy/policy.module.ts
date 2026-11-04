import { Global, Module } from '@nestjs/common';

import { PolicyService } from './application/policy.use-cases';
import { POLICY_READER, POLICY_REPOSITORY } from './application/ports';
import { KyselyPolicyRepository } from './infrastructure/kysely-policy.repository';
import { PolicyController } from './presentation/policy.controller';

@Global()
@Module({
  controllers: [PolicyController],
  providers: [
    KyselyPolicyRepository,
    { provide: POLICY_REPOSITORY, useExisting: KyselyPolicyRepository },
    { provide: POLICY_READER, useExisting: KyselyPolicyRepository },
    PolicyService,
  ],
  exports: [POLICY_READER, PolicyService],
})
export class PolicyModule {}
