import { Module } from '@nestjs/common';

import { DeleteFaceUseCase, EnrollFaceUseCase } from './application/enroll-face.use-case';
import { EnrollmentController } from './presentation/enrollment.controller';

@Module({ controllers: [EnrollmentController], providers: [EnrollFaceUseCase, DeleteFaceUseCase] })
export class EnrollmentModule {}
