import { PartialType } from '@nestjs/swagger';
import { CreatePermDto } from './create-perm.dto';

export class UpdatePermDto extends PartialType(CreatePermDto) {}
