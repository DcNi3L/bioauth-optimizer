import { Module } from '@nestjs/common';

import { CROSS_DEVICE_STORE, CrossDeviceService } from './application/cross-device.service';
import { KyselyCrossDeviceStore } from './infrastructure/kysely-cross-device.store';
import { CrossDeviceController } from './presentation/cross-device.controller';

@Module({
  controllers: [CrossDeviceController],
  providers: [{ provide: CROSS_DEVICE_STORE, useClass: KyselyCrossDeviceStore }, CrossDeviceService],
})
export class CrossDeviceModule {}
