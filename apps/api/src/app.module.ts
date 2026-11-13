import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { BiometricsModule } from './modules/biometrics/biometrics.module';
import { CalibrationModule } from './modules/calibration/calibration.module';
import { ConsentModule } from './modules/consent/consent.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { ExamplesModule } from './modules/examples/examples.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { FactorCatalogsModule } from './modules/factor-catalogs/factor-catalogs.module';
import { FactorSelectionModule } from './modules/factor-selection/factor-selection.module';
import { IdentityModule } from './modules/identity/identity.module';
import { KeystrokeModule } from './modules/keystroke/keystroke.module';
import { MfaModule } from './modules/mfa/mfa.module';
import { OidcModule } from './modules/oidc/oidc.module';
import { PolicyModule } from './modules/policy/policy.module';
import { ScoreDatasetsModule } from './modules/score-datasets/score-datasets.module';
import { ThresholdModule } from './modules/threshold/threshold.module';
import { VerificationModule } from './modules/verification/verification.module';
import { WebAuthnModule } from './modules/webauthn/webauthn.module';
import { AuthGuard } from './shared/auth/auth';
import { ConfigModule } from './shared/config/config.module';
import { APP_CONFIG, type AppConfig } from './shared/config/env';
import { DatabaseModule } from './shared/database/database.module';
import { HealthController } from './shared/health/health.controller';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';
import { LoggingModule } from './shared/logging/logging.module';
import { HttpMetricsInterceptor, Metrics, MetricsController } from './shared/metrics/metrics';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [{ ttl: 60_000, limit: config.AUTH_RATE_LIMIT_PER_MIN * 10 }],
    }),
    AuditModule,
    IdentityModule,
    BiometricsModule,
    PolicyModule,
    ConsentModule,
    WebAuthnModule,
    MfaModule,
    KeystrokeModule,
    EnrollmentModule,
    VerificationModule,
    CalibrationModule,
    AdminModule,
    OidcModule,
    ThresholdModule,
    FactorSelectionModule,
    FactorCatalogsModule,
    ScoreDatasetsModule,
    ExperimentsModule,
    ExamplesModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    Metrics,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Порядок важен: сначала ограничение частоты, затем сессия и права (закрыто по умолчанию).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
