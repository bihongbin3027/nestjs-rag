import { Injectable } from '@nestjs/common';
import { CreatePermDto } from './dto/create-perm.dto';
import { UpdatePermDto } from './dto/update-perm.dto';

@Injectable()
export class PermService {
  create(createPermDto: CreatePermDto) {
    return 'This action adds a new perm';
  }

  findAll() {
    return `This action returns all perm`;
  }

  findOne(id: number) {
    return `This action returns a #${id} perm`;
  }

  update(id: number, updatePermDto: UpdatePermDto) {
    return `This action updates a #${id} perm`;
  }

  remove(id: number) {
    return `This action removes a #${id} perm`;
  }

  async findUserPerms(userId: string) {
    return [] as { path: string; method: string }[];
  }
}
