import { Module } from '@nestjs/common';
import { PermService } from './perm.service';
import { PermController } from './perm.controller';

@Module({
  controllers: [PermController],
  providers: [PermService],
  exports: [PermService],
})
export class PermModule {}
