import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessTypesController } from './business-types.controller';
import { BusinessTypesService } from './business-types.service';

@Module({
  imports: [AuthModule],
  controllers: [BusinessTypesController],
  providers: [BusinessTypesService],
})
export class BusinessTypesModule {}
