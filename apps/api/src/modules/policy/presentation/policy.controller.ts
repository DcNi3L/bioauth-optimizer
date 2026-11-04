import { type AuthPolicyDto, authPolicySchema, costsSchema, policyStepsSchema, z } from '@bioauth/contracts';
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthUser, CurrentUser, RequireMfa, Roles } from '../../../shared/auth/auth';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { PolicyService } from '../application/policy.use-cases';

const proposeSchema = z.strictObject({
  steps: policyStepsSchema,
  costs: costsSchema,
  rationale: z.string().trim().max(2000).nullable().default(null),
  experimentId: z.uuid().nullable().default(null),
});
const decisionSchema = z.strictObject({ note: z.string().trim().max(2000).nullable().default(null) });

@ApiTags('Политики входа')
@Controller('policies')
export class PolicyController {
  constructor(private readonly policies: PolicyService) {}

  @Get()
  @Roles('admin', 'researcher', 'auditor')
  @ApiOperation({ summary: 'Все версии политик (новые сверху)' })
  @ApiZodOk(z.array(authPolicySchema))
  list(): Promise<AuthPolicyDto[]> {
    return this.policies.list();
  }

  @Get(':id')
  @Roles('admin', 'researcher', 'auditor')
  @ApiZodOk(authPolicySchema)
  get(@Param('id', UuidPipe) id: string): Promise<AuthPolicyDto> {
    return this.policies.get(id);
  }

  @Post()
  @HttpCode(201)
  @Roles('admin', 'researcher')
  @RequireMfa()
  @ApiOperation({ summary: 'Предложить политику вручную (калибровка предлагает автоматически)' })
  @ApiZodBody(proposeSchema)
  propose(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(proposeSchema)) body: z.infer<typeof proposeSchema>,
  ) {
    return this.policies.propose(user, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('admin')
  @RequireMfa()
  @ApiOperation({ summary: 'Утвердить: политика становится активной, предыдущая — выведена' })
  @ApiZodBody(decisionSchema)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.policies.approve(user, id, body.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('admin')
  @RequireMfa()
  @ApiZodBody(decisionSchema)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.policies.reject(user, id, body.note);
  }

  @Post(':id/rollback')
  @HttpCode(200)
  @Roles('admin')
  @RequireMfa()
  @ApiOperation({ summary: 'Откат к ранее действовавшей версии' })
  @ApiZodBody(decisionSchema)
  rollback(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.policies.rollback(user, id, body.note);
  }
}
