import { Test, TestingModule } from '@nestjs/testing';
import { PermController } from './perm.controller';
import { PermService } from './perm.service';

describe('PermController', () => {
  let controller: PermController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermController],
      providers: [PermService],
    }).compile();

    controller = module.get<PermController>(PermController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
