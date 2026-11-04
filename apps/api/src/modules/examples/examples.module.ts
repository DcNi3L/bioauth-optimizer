import { Module } from '@nestjs/common';
import { ExamplesController } from './presentation/examples.controller';

@Module({ controllers: [ExamplesController] })
export class ExamplesModule {}
